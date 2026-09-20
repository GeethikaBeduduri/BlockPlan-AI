"""ML criticality-scoring service interface and integration adapter.

Architecture Boundary
---------------------
- Group 1 (ML Team) owns the trained ML models (e.g., XGBoost, feature pipelines).
- Person 1 (Backend) owns the integration contract, request/response validation,
  batch orchestration, and boundary error handling.

This module defines:
  1. ``MLScoringClient`` Protocol (what Group 1 or transport client implements).
  2. ``MlScoringService`` Protocol (what backend services like PlanService consume).
  3. ``MLScoringServiceAdapter`` (robust backend adapter that validates batches,
     verifies score ranges [0.0–100.0], checks ID completeness, and catches timeouts/outages).
  4. ``UnavailableMlScoringService`` (default placeholder until Group 1 lands).
  5. ``LocalCallableMLClient`` (convenience wrapper for in-memory Python callable models).
"""

from __future__ import annotations

import logging
import math
import os
from pathlib import Path
import pickle
from typing import Any, Callable, Protocol, runtime_checkable

import numpy as np
import pandas as pd

from app.schemas.internal import ScoredTask
from app.schemas.ml import (
    MLBatchScoringRequest,
    MLBatchScoringResponse,
    MLTaskFeature,
    MLTaskScoreItem,
)
from app.services.exceptions import (
    ApiServiceError,
    MLResponseValidationError,
    MLServiceError,
    MLTimeoutError,
    MLUnavailableError,
)

logger = logging.getLogger(__name__)
_ML_NOT_READY_MSG = (
    "ML criticality-scoring component is not wired. "
    "Group 1 must implement MLScoringClient or MlScoringService and register it. "
    "No scores are fabricated."
)


@runtime_checkable
class MLScoringClient(Protocol):
    """Low-level driver interface for ML inference.

    Group 1 can back this via:
      - Local Python function/class invoking XGBoost (``model.pkl``)
      - Internal HTTP/REST service endpoint
      - RPC/gRPC microservice
      - Celery async worker
    """

    def score_batch(self, request: MLBatchScoringRequest) -> MLBatchScoringResponse:
        """Execute batch inference for the provided task features.

        Args:
            request: Batch of task feature items to score.

        Returns:
            MLBatchScoringResponse containing scored results for every task.

        Raises:
            MLUnavailableError / ConnectionError: If ML service is offline.
            MLTimeoutError / TimeoutError: If inference exceeds SLA.
            Exception: Any unexpected model execution failure.
        """
        ...


@runtime_checkable
class MlScoringService(Protocol):
    """High-level service interface consumed by backend workflows (e.g. PlanService)."""

    def score_tasks(self, tasks: list[ScoredTask]) -> list[ScoredTask]:
        """Score a list of ScoredTask objects and return them with populated scores."""
        ...

    def score_batch(self, request: MLBatchScoringRequest) -> MLBatchScoringResponse:
        """Direct batch scoring interface."""
        ...


class MLScoringServiceAdapter:
    """Production backend adapter wrapping any ``MLScoringClient``.

    Responsibilities:
      - Converts domain tasks to ``MLBatchScoringRequest``.
      - Enforces batch validation (non-empty, valid bounds).
      - Delegates to the configured ``MLScoringClient``.
      - Validates the ML response:
          * Complete 1:1 match of requested task_ids (no missing or extra IDs).
          * No duplicate task_ids.
          * Strict score bounds (0.0 <= score <= 100.0, non-NaN).
      - Maps transport/library exceptions into typed ``ApiServiceError`` hierarchy.
    """

    def __init__(self, client: MLScoringClient) -> None:
        self._client = client

    def reload(self) -> None:
        """Forward reload request to underlying client if supported."""
        if hasattr(self._client, "reload") and callable(self._client.reload):
            self._client.reload()

    def score_tasks(self, tasks: list[ScoredTask]) -> list[ScoredTask]:
        """Translate ScoredTask batch, execute scoring, and return scored copies."""
        if not tasks:
            return []

        # Convert ScoredTask objects to MLTaskFeature items
        features = [
            MLTaskFeature(
                task_id=t.task_id,
                department=t.department,
                corridor_id=t.corridor_id,
                defect_severity=t.defect_severity,
                days_overdue=t.days_overdue,
                estimated_hours=t.estimated_hours,
                asset_age_years=t.asset_age_years,
            )
            for t in tasks
        ]

        request = MLBatchScoringRequest(tasks=features)
        response = self.score_batch(request)

        # Create lookup mapping task_id -> score item
        score_by_id = {item.task_id: item for item in response.scores}

        # Return updated ScoredTask instances
        return [
            task.model_copy(
                update={"criticality_score": score_by_id[task.task_id].criticality_score}
            )
            for task in tasks
        ]

    def score_batch(self, request: MLBatchScoringRequest) -> MLBatchScoringResponse:
        """Send batch to client and rigorously validate the returned response."""
        if not request.tasks:
            raise ApiServiceError("ML scoring request must contain at least one task.")

        expected_ids = {t.task_id for t in request.tasks}

        # 1. Execute ML scoring call with exception translation
        try:
            response = self._client.score_batch(request)
        except MLUnavailableError:
            raise
        except MLTimeoutError:
            raise
        except MLResponseValidationError:
            raise
        except TimeoutError as exc:
            raise MLTimeoutError(f"ML criticality scoring timed out: {exc}") from exc
        except ConnectionError as exc:
            raise MLUnavailableError(f"ML criticality service unreachable: {exc}") from exc
        except Exception as exc:
            raise MLServiceError(f"ML criticality scoring failed: {exc}") from exc

        # 2. Validate response structure
        if response is None or not hasattr(response, "scores") or response.scores is None:
            raise MLResponseValidationError("ML service returned an empty or malformed response.")

        # 3. Validate 1:1 ID completeness and uniqueness
        received_ids: set[int] = set()
        for item in response.scores:
            if not isinstance(item, MLTaskScoreItem):
                raise MLResponseValidationError(
                    f"Invalid score item in ML response: {item}"
                )

            tid = item.task_id
            if tid in received_ids:
                raise MLResponseValidationError(
                    f"ML response contains duplicate score for task_id={tid}."
                )
            received_ids.add(tid)

            score = item.criticality_score
            if score is None or math.isnan(score) or score < 0.0 or score > 100.0:
                raise MLResponseValidationError(
                    f"ML response score for task_id={tid} is out of bounds (score={score}, required 0.0-100.0)."
                )

        # Check for missing task IDs
        missing_ids = expected_ids - received_ids
        if missing_ids:
            raise MLResponseValidationError(
                f"ML service failed to return scores for requested task IDs: {sorted(missing_ids)}."
            )

        # Check for extra/unexpected task IDs
        extra_ids = received_ids - expected_ids
        if extra_ids:
            raise MLResponseValidationError(
                f"ML service returned unexpected task IDs not in request: {sorted(extra_ids)}."
            )

        return response


class UnavailableMlScoringService:
    """Explicit placeholder until Group 1 provides the ML implementation."""

    def score_tasks(self, tasks: list[ScoredTask]) -> list[ScoredTask]:
        raise MLUnavailableError(_ML_NOT_READY_MSG)

    def score_batch(self, request: MLBatchScoringRequest) -> MLBatchScoringResponse:
        raise MLUnavailableError(_ML_NOT_READY_MSG)


class LocalCallableMLClient:
    """Adapter for in-process Python callables (e.g. Group 1 local XGBoost pipeline).

    Accepts a callable: ``Callable[[MLBatchScoringRequest], MLBatchScoringResponse]``
    or ``Callable[[list[dict]], list[dict]]``.
    """

    def __init__(
        self,
        handler: Callable[[MLBatchScoringRequest], MLBatchScoringResponse],
    ) -> None:
        self._handler = handler

    def score_batch(self, request: MLBatchScoringRequest) -> MLBatchScoringResponse:
        return self._handler(request)


class LocalPickleMLClient:
    """Production in-process ML inference client loading the trained XGBoost model from a pickle file (.pkl).

    Responsibilities:
      - Safely loads and unpickles `model.pkl` with path discovery, auto-reloading on file change, and caching.
      - Supports unpickling model estimators, dicts with metadata/features, and pipeline objects.
      - Transforms input tasks into numerical features matching the trained model:
          * `days_overdue` (int)
          * `estimated_hours` (float)
          * `asset_age_years` (int)
          * `severity_numeric` (ordinal: A=3, B=2, C=1)
          * `department_S&T` (binary: 1 for S&T, 0 otherwise)
          * `department_Traction` (binary: 1 for Traction, 0 otherwise)
      - Executes batch inference through XGBRegressor.
      - Normalizes/clips risk predictions to strict [0.0, 100.0] criticality score scale.
      - Produces valid MLBatchScoringResponse with 1:1 task item mapping.
    """

    DEFAULT_FEATURE_COLUMNS: list[str] = [
        "days_overdue",
        "estimated_hours",
        "asset_age_years",
        "severity_numeric",
        "department_S&T",
        "department_Traction",
    ]

    SEVERITY_MAP: dict[str, int] = {
        "A": 3,
        "B": 2,
        "C": 1,
        "3": 3,
        "2": 2,
        "1": 1,
    }

    def __init__(
        self,
        model_path: str | Path | None = None,
        *,
        model: Any | None = None,
    ) -> None:
        self._model: Any | None = model
        self._model_path: Path | None = Path(model_path) if model_path else None
        self._resolved_model_path: Path | None = None
        self._last_mtime: float | None = None
        self._feature_columns: list[str] = list(self.DEFAULT_FEATURE_COLUMNS)
        self._metadata: dict[str, Any] = {}

        if self._model is None:
            self._load_model()

    def _resolve_model_path(self) -> Path:
        """Find the pickle model file across candidate paths."""
        if self._model_path is not None:
            return self._model_path.resolve()

        env_path = os.getenv("ML_MODEL_PATH")
        if env_path:
            return Path(env_path).resolve()

        # Common project locations
        cwd = Path.cwd()
        here = Path(__file__).resolve()
        candidates = [
            cwd / "model.pkl",
            here.parents[2] / "model.pkl",
            here.parents[1] / "model.pkl",
            here.parent / "model.pkl",
            cwd / "backend" / "data" / "model.pkl",
        ]

        for path in candidates:
            try:
                resolved = path.resolve()
                if resolved.is_file():
                    return resolved
            except OSError:
                continue

        return (here.parents[2] / "model.pkl").resolve()

    def reload(self) -> None:
        """Force a reload of the pickle model from disk."""
        self._load_model()

    def _load_model(self) -> None:
        """Load and cache the pickled model instance from disk."""
        target_path = self._resolve_model_path()
        if not target_path.is_file():
            raise MLUnavailableError(
                f"Pickle model file not found at {target_path}. "
                "Ensure 'model.pkl' is present or set ML_MODEL_PATH environment variable."
            )

        try:
            mtime = target_path.stat().st_mtime
            with open(target_path, "rb") as f:
                unpickled_obj = pickle.load(f)

            # Unpack object if stored as dict, tuple, or direct estimator
            model_obj: Any | None = None
            metadata: dict[str, Any] = {}
            custom_features: list[str] | None = None

            if isinstance(unpickled_obj, dict):
                # Search for model estimator in dict keys
                for key in ["model", "estimator", "regressor", "pipeline", "predictor", "xgb_model"]:
                    if key in unpickled_obj and hasattr(unpickled_obj[key], "predict"):
                        model_obj = unpickled_obj[key]
                        break
                if model_obj is None:
                    for k, v in unpickled_obj.items():
                        if hasattr(v, "predict"):
                            model_obj = v
                            break
                if model_obj is None:
                    raise ValueError("No model with a 'predict' method found inside pickled dictionary.")

                metadata = {k: v for k, v in unpickled_obj.items() if k != "model" and not hasattr(v, "predict")}
                feat_val = unpickled_obj.get("feature_names") or unpickled_obj.get("feature_columns") or unpickled_obj.get("features")
                if isinstance(feat_val, (list, tuple)):
                    custom_features = [str(x) for x in feat_val]

            elif isinstance(unpickled_obj, (list, tuple)):
                for item in unpickled_obj:
                    if hasattr(item, "predict"):
                        model_obj = item
                        break
                if model_obj is None:
                    raise ValueError("No model with a 'predict' method found inside pickled sequence.")
            else:
                model_obj = unpickled_obj

            self._model = model_obj
            self._metadata = metadata
            self._last_mtime = mtime
            self._resolved_model_path = target_path

            # Determine feature columns
            if custom_features:
                self._feature_columns = custom_features
            elif hasattr(model_obj, "feature_names_in_"):
                self._feature_columns = list(model_obj.feature_names_in_)
            else:
                self._feature_columns = list(self.DEFAULT_FEATURE_COLUMNS)

            logger.info("Successfully loaded ML model from %s (features=%s)", target_path, self._feature_columns)
        except Exception as exc:
            raise MLUnavailableError(
                f"Failed to load/unpickle ML model from {target_path}: {exc}"
            ) from exc

    def _check_and_reload_if_modified(self) -> None:
        """Check if model file was modified on disk and reload if necessary."""
        if self._resolved_model_path is None or not self._resolved_model_path.is_file():
            return
        try:
            current_mtime = self._resolved_model_path.stat().st_mtime
            if self._last_mtime is not None and current_mtime != self._last_mtime:
                logger.info("Detected change in model file on disk. Reloading...")
                self._load_model()
        except OSError:
            pass

    def score_batch(self, request: MLBatchScoringRequest) -> MLBatchScoringResponse:
        """Execute batch inference for the provided task features."""
        self._check_and_reload_if_modified()

        if self._model is None:
            self._load_model()

        if not request.tasks:
            raise ApiServiceError("ML scoring request must contain at least one task.")

        # Extract features for all tasks
        rows: list[dict[str, Any]] = []
        for task in request.tasks:
            # Parse severity
            sev_raw = (
                task.defect_severity.value
                if hasattr(task.defect_severity, "value")
                else str(task.defect_severity)
            ).strip().upper()
            sev_num = self.SEVERITY_MAP.get(sev_raw, 1)

            # Parse department
            dept_raw = (
                task.department.value
                if hasattr(task.department, "value")
                else str(task.department)
            ).strip()
            dept_st = 1 if dept_raw in {"S&T", "S_AND_T", "SMMS"} else 0
            dept_tr = 1 if dept_raw in {"Traction", "TRACTION", "TDMS"} else 0

            row_dict = {
                "days_overdue": int(task.days_overdue),
                "estimated_hours": float(task.estimated_hours),
                "asset_age_years": int(task.asset_age_years),
                "severity_numeric": sev_num,
                "department_S&T": dept_st,
                "department_Traction": dept_tr,
            }
            rows.append(row_dict)

        df = pd.DataFrame(rows)
        # Ensure only model expected columns exist in order
        for col in self._feature_columns:
            if col not in df.columns:
                df[col] = 0
        df = df[self._feature_columns]

        try:
            raw_predictions = self._model.predict(df)
        except Exception as exc:
            raise MLServiceError(f"Pickle model prediction failed: {exc}") from exc

        preds = np.asarray(raw_predictions, dtype=float)

        # Scale predictions to [0.0, 100.0]
        min_val = float(np.min(preds))
        max_val = float(np.max(preds))

        if len(preds) > 1 and (max_val - min_val) > 1e-6:
            scaled_scores = (preds - min_val) / (max_val - min_val) * 100.0
        else:
            scaled_scores = np.clip(preds, 0.0, 100.0)

        # Guard against NaN/inf and guarantee bounds [0.0, 100.0]
        scaled_scores = np.nan_to_num(scaled_scores, nan=50.0, posinf=100.0, neginf=0.0)
        scaled_scores = np.clip(scaled_scores, 0.0, 100.0)

        items: list[MLTaskScoreItem] = []
        for i, task in enumerate(request.tasks):
            score_val = round(float(scaled_scores[i]), 2)
            raw_risk = round(float(preds[i]), 4)
            items.append(
                MLTaskScoreItem(
                    task_id=task.task_id,
                    criticality_score=score_val,
                    predicted_risk=raw_risk,
                )
            )

        model_ver = getattr(self._model, "__class__", type(self._model)).__name__
        resp_metadata: dict[str, Any] = {
            "model_source": str(self._resolved_model_path or "in-memory"),
            "task_count": len(request.tasks),
            "feature_columns": self._feature_columns,
        }
        resp_metadata.update(self._metadata)

        return MLBatchScoringResponse(
            scores=items,
            model_version=f"{model_ver}-v1.0",
            metadata=resp_metadata,
        )


LocalXGBoostMLClient = LocalPickleMLClient


def get_ml_service(
    model_path: str | Path | None = None,
) -> MlScoringService:
    """Factory creating an ML criticality scoring service adapter loaded from model.pkl."""
    try:
        client = LocalPickleMLClient(model_path=model_path)
        return MLScoringServiceAdapter(client=client)
    except Exception as exc:
        logger.warning("Could not initialize LocalPickleMLClient: %s", exc)
        return UnavailableMlScoringService()

