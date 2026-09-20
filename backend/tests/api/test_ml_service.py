"""Unit tests for ML Criticality Scoring integration contract and adapter.

Tests verify:
  - Batch request and response schema validation.
  - Criticality score bounds enforcement (0.0–100.0).
  - ID completeness, duplicate detection, and missing ID guards.
  - Error translation (unavailable model, timeout, malformed responses).
  - In-process callable adapter behavior.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.enums import DefectSeverity, Department
from app.schemas.internal import ScoredTask
from app.schemas.ml import (
    MLBatchScoringRequest,
    MLBatchScoringResponse,
    MLTaskFeature,
    MLTaskScoreItem,
)
from app.services.exceptions import (
    MLResponseValidationError,
    MLServiceError,
    MLTimeoutError,
    MLUnavailableError,
)
from app.services.ml_service import (
    LocalCallableMLClient,
    LocalPickleMLClient,
    LocalXGBoostMLClient,
    MLScoringServiceAdapter,
    UnavailableMlScoringService,
    get_ml_service,
)


def _sample_task(task_id: int = 1, score: float = 0.0) -> ScoredTask:
    return ScoredTask(
        task_id=task_id,
        department=Department.ENGINEERING,
        corridor_id="COR_01",
        defect_severity=DefectSeverity.A,
        days_overdue=5,
        estimated_hours=4.0,
        asset_age_years=10,
        criticality_score=score,
    )


class TestMLSchemas:
    def test_ml_task_feature_valid(self) -> None:
        feat = MLTaskFeature(
            task_id=101,
            department=Department.TRACTION,
            corridor_id="COR_02",
            defect_severity=DefectSeverity.B,
            days_overdue=10,
            estimated_hours=6.0,
            asset_age_years=15,
        )
        assert feat.task_id == 101
        assert feat.corridor_id == "COR_02"

    def test_ml_task_score_bounds(self) -> None:
        # Valid boundary scores
        item_zero = MLTaskScoreItem(task_id=1, criticality_score=0.0)
        assert item_zero.criticality_score == 0.0

        item_hundred = MLTaskScoreItem(task_id=1, criticality_score=100.0)
        assert item_hundred.criticality_score == 100.0

        # Score out of bounds (< 0.0 or > 100.0)
        with pytest.raises(ValidationError):
            MLTaskScoreItem(task_id=1, criticality_score=-0.1)

        with pytest.raises(ValidationError):
            MLTaskScoreItem(task_id=1, criticality_score=100.01)

    def test_ml_batch_request_requires_non_empty(self) -> None:
        with pytest.raises(ValidationError):
            MLBatchScoringRequest(tasks=[])


class TestMLScoringServiceAdapter:
    def test_empty_tasks_returns_empty_immediately(self) -> None:
        adapter = MLScoringServiceAdapter(client=UnavailableMlScoringService())
        assert adapter.score_tasks([]) == []

    def test_successful_batch_scoring(self) -> None:
        tasks = [_sample_task(task_id=1), _sample_task(task_id=2)]

        def _mock_ml(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
            return MLBatchScoringResponse(
                scores=[
                    MLTaskScoreItem(
                        task_id=1,
                        criticality_score=92.5,
                        predicted_risk=0.88,
                        ranking_metadata={"feature_weight": 0.4},
                    ),
                    MLTaskScoreItem(
                        task_id=2,
                        criticality_score=45.0,
                        predicted_risk=0.32,
                    ),
                ],
                model_version="xgb-v1.2.0",
            )

        client = LocalCallableMLClient(_mock_ml)
        service = MLScoringServiceAdapter(client=client)

        scored = service.score_tasks(tasks)
        assert len(scored) == 2
        assert scored[0].task_id == 1
        assert scored[0].criticality_score == 92.5
        assert scored[1].task_id == 2
        assert scored[1].criticality_score == 45.0

    def test_missing_task_id_in_response_raises_validation_error(self) -> None:
        tasks = [_sample_task(task_id=1), _sample_task(task_id=2)]

        # Response only returns score for task 1, missing task 2
        def _incomplete_ml(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
            return MLBatchScoringResponse(
                scores=[MLTaskScoreItem(task_id=1, criticality_score=80.0)]
            )

        service = MLScoringServiceAdapter(client=LocalCallableMLClient(_incomplete_ml))
        with pytest.raises(MLResponseValidationError, match="failed to return scores"):
            service.score_tasks(tasks)

    def test_extra_task_id_in_response_raises_validation_error(self) -> None:
        tasks = [_sample_task(task_id=1)]

        # Response returns unexpected task 99
        def _extra_ml(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
            return MLBatchScoringResponse(
                scores=[
                    MLTaskScoreItem(task_id=1, criticality_score=80.0),
                    MLTaskScoreItem(task_id=99, criticality_score=50.0),
                ]
            )

        service = MLScoringServiceAdapter(client=LocalCallableMLClient(_extra_ml))
        with pytest.raises(MLResponseValidationError, match="unexpected task IDs"):
            service.score_tasks(tasks)

    def test_duplicate_task_id_in_response_raises_validation_error(self) -> None:
        tasks = [_sample_task(task_id=1)]

        def _dup_ml(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
            return MLBatchScoringResponse(
                scores=[
                    MLTaskScoreItem(task_id=1, criticality_score=80.0),
                    MLTaskScoreItem(task_id=1, criticality_score=85.0),
                ]
            )

        service = MLScoringServiceAdapter(client=LocalCallableMLClient(_dup_ml))
        with pytest.raises(MLResponseValidationError, match="duplicate score"):
            service.score_tasks(tasks)

    def test_connection_error_translated_to_unavailable_error(self) -> None:
        def _offline_ml(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
            raise ConnectionError("Connection refused by ML server at port 50051")

        service = MLScoringServiceAdapter(client=LocalCallableMLClient(_offline_ml))
        with pytest.raises(MLUnavailableError, match="unreachable"):
            service.score_tasks([_sample_task(1)])

    def test_timeout_error_translated_to_ml_timeout_error(self) -> None:
        def _slow_ml(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
            raise TimeoutError("ML inference took longer than 5000ms SLA")

        service = MLScoringServiceAdapter(client=LocalCallableMLClient(_slow_ml))
        with pytest.raises(MLTimeoutError, match="timed out"):
            service.score_tasks([_sample_task(1)])

    def test_generic_exception_translated_to_ml_service_error(self) -> None:
        def _crashed_ml(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
            raise RuntimeError("Model weight array buffer overflow")

        service = MLScoringServiceAdapter(client=LocalCallableMLClient(_crashed_ml))
        with pytest.raises(MLServiceError, match="failed: Model weight"):
            service.score_tasks([_sample_task(1)])

    def test_unavailable_stub_raises_unavailable_error(self) -> None:
        stub = UnavailableMlScoringService()
        with pytest.raises(MLUnavailableError, match="not wired"):
            stub.score_tasks([_sample_task(1)])

        with pytest.raises(MLUnavailableError, match="not wired"):
            stub.score_batch(
                MLBatchScoringRequest(
                    tasks=[
                        MLTaskFeature(
                            task_id=1,
                            department=Department.ENGINEERING,
                            corridor_id="COR_01",
                            defect_severity=DefectSeverity.A,
                            days_overdue=1,
                            estimated_hours=2.0,
                            asset_age_years=5,
                        )
                    ]
                )
            )


class TestLocalPickleMLClient:
    def test_pickle_client_loads_and_scores_batch(self) -> None:
        client = LocalPickleMLClient()
        request = MLBatchScoringRequest(
            tasks=[
                MLTaskFeature(
                    task_id=1,
                    department=Department.ENGINEERING,
                    corridor_id="COR_01",
                    defect_severity=DefectSeverity.A,
                    days_overdue=10,
                    estimated_hours=4.0,
                    asset_age_years=5,
                ),
                MLTaskFeature(
                    task_id=2,
                    department=Department.S_AND_T,
                    corridor_id="COR_02",
                    defect_severity=DefectSeverity.B,
                    days_overdue=2,
                    estimated_hours=2.0,
                    asset_age_years=12,
                ),
                MLTaskFeature(
                    task_id=3,
                    department=Department.TRACTION,
                    corridor_id="COR_03",
                    defect_severity=DefectSeverity.C,
                    days_overdue=0,
                    estimated_hours=1.0,
                    asset_age_years=2,
                ),
            ]
        )
        response = client.score_batch(request)
        assert len(response.scores) == 3
        for item in response.scores:
            assert 0.0 <= item.criticality_score <= 100.0
            assert item.predicted_risk is not None

    def test_pickle_client_with_service_adapter(self) -> None:
        client = LocalPickleMLClient()
        adapter = MLScoringServiceAdapter(client=client)

        tasks = [
            _sample_task(task_id=10),
            _sample_task(task_id=20),
        ]
        scored = adapter.score_tasks(tasks)
        assert len(scored) == 2
        assert scored[0].task_id == 10
        assert scored[1].task_id == 20
        assert 0.0 <= scored[0].criticality_score <= 100.0
        assert 0.0 <= scored[1].criticality_score <= 100.0

    def test_pickle_client_single_task(self) -> None:
        client = LocalPickleMLClient()
        request = MLBatchScoringRequest(
            tasks=[
                MLTaskFeature(
                    task_id=100,
                    department=Department.ENGINEERING,
                    corridor_id="COR_01",
                    defect_severity=DefectSeverity.A,
                    days_overdue=30,
                    estimated_hours=6.0,
                    asset_age_years=20,
                )
            ]
        )
        response = client.score_batch(request)
        assert len(response.scores) == 1
        assert response.scores[0].task_id == 100
        assert 0.0 <= response.scores[0].criticality_score <= 100.0

    def test_pickle_client_invalid_path_raises_unavailable(self, tmp_path) -> None:
        non_existent = tmp_path / "does_not_exist_model.pkl"
        with pytest.raises(MLUnavailableError, match="not found"):
            LocalPickleMLClient(model_path=non_existent)

    def test_get_ml_service_factory(self) -> None:
        service = get_ml_service()
        assert isinstance(service, MLScoringServiceAdapter)
        scored = service.score_tasks([_sample_task(task_id=1)])
        assert len(scored) == 1
        assert 0.0 <= scored[0].criticality_score <= 100.0

    def test_pickle_client_reload_explicit(self) -> None:
        client = LocalPickleMLClient()
        client.reload()
        response = client.score_batch(
            MLBatchScoringRequest(
                tasks=[
                    MLTaskFeature(
                        task_id=5,
                        department=Department.ENGINEERING,
                        corridor_id="COR_01",
                        defect_severity=DefectSeverity.A,
                        days_overdue=5,
                        estimated_hours=2.0,
                        asset_age_years=3,
                    )
                ]
            )
        )
        assert len(response.scores) == 1
        assert 0.0 <= response.scores[0].criticality_score <= 100.0

    def test_pickle_client_dict_format_with_metadata(self, tmp_path) -> None:
        import pickle
        from xgboost import XGBRegressor

        orig_client = LocalPickleMLClient()
        test_dict_path = tmp_path / "dict_model.pkl"
        payload = {
            "model": orig_client._model,
            "version": "v2.1",
            "author": "OptimizationTeam",
            "feature_columns": orig_client.DEFAULT_FEATURE_COLUMNS,
        }
        with open(test_dict_path, "wb") as f:
            pickle.dump(payload, f)

        dict_client = LocalPickleMLClient(model_path=test_dict_path)
        resp = dict_client.score_batch(
            MLBatchScoringRequest(
                tasks=[
                    MLTaskFeature(
                        task_id=1,
                        department=Department.TRACTION,
                        corridor_id="COR_03",
                        defect_severity=DefectSeverity.C,
                        days_overdue=0,
                        estimated_hours=1.0,
                        asset_age_years=1,
                    )
                ]
            )
        )
        assert len(resp.scores) == 1
        assert resp.metadata.get("version") == "v2.1"


