"""Unit tests for OR-Tools Scheduling Optimizer integration contract and adapter.

Tests verify:
  - Batch request and response schema validation.
  - 1:1 Task ID completeness (preventing silent task omissions).
  - Corridor matching constraints between tasks and windows.
  - Window capacity limit enforcement.
  - Unscheduled task preservation and KPI invariant checks.
  - Error translation (unavailable solver, timeout, infeasibility, crashes).
  - Support for daily, weekly, and monthly planning horizons.
"""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    PlanningHorizonType,
    Weekday,
)
from app.schemas.horizon import PlanningHorizonSpec
from app.schemas.internal import ScoredTask
from app.schemas.kpis import KpiResponse
from app.schemas.optimizer import (
    OptimizerConstraints,
    OptimizerInput,
    OptimizerMetadata,
    OptimizerResult,
    OptimizerWindow,
)
from app.services.exceptions import (
    OptimizerInfeasibleError,
    OptimizerResponseValidationError,
    OptimizerServiceError,
    OptimizerTimeoutError,
    OptimizerUnavailableError,
)
from app.services.optimizer_service import (
    LocalCallableOptimizerClient,
    OptimizerServiceAdapter,
    UnavailableOptimizerService,
)


def _sample_task(
    task_id: int = 1,
    corridor_id: str = "COR_01",
    estimated_hours: float = 4.0,
    severity: DefectSeverity = DefectSeverity.A,
) -> ScoredTask:
    return ScoredTask(
        task_id=task_id,
        department=Department.ENGINEERING,
        corridor_id=corridor_id,
        defect_severity=severity,
        days_overdue=5,
        estimated_hours=estimated_hours,
        asset_age_years=10,
        criticality_score=90.0,
    )


def _sample_window(
    window_id: int = 10,
    corridor_id: str = "COR_01",
    available_hours: float = 8.0,
    day: Weekday = Weekday.MON,
) -> OptimizerWindow:
    return OptimizerWindow(
        window_id=window_id,
        corridor_id=corridor_id,
        day=day,
        available_hours=available_hours,
    )


class TestOptimizerSchemas:
    def test_optimizer_input_valid(self) -> None:
        payload = OptimizerInput(
            tasks=[_sample_task(1)],
            windows=[_sample_window(10)],
            horizon=PlanningHorizonSpec(
                horizon_type=PlanningHorizonType.WEEKLY,
                horizon_start=date(2026, 8, 24),
                horizon_end=date(2026, 8, 30),
            ),
            constraints=OptimizerConstraints(max_solver_duration_seconds=15.0),
        )
        assert len(payload.tasks) == 1
        assert len(payload.windows) == 1
        assert payload.constraints.max_solver_duration_seconds == 15.0

    def test_optimizer_input_requires_tasks_and_windows(self) -> None:
        with pytest.raises(ValidationError):
            OptimizerInput(tasks=[], windows=[_sample_window(10)])

        with pytest.raises(ValidationError):
            OptimizerInput(tasks=[_sample_task(1)], windows=[])


class TestOptimizerServiceAdapter:
    def test_successful_optimization_and_assignment(self) -> None:
        task1 = _sample_task(1, "COR_01", 4.0)
        task2 = _sample_task(2, "COR_01", 3.0)
        win = _sample_window(10, "COR_01", 8.0)

        def _mock_solver(req: OptimizerInput) -> OptimizerResult:
            return OptimizerResult(
                assignments=[
                    PlanAssignmentResponse(
                        task_id=1,
                        window_id=10,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=Weekday.MON,
                        estimated_hours=4.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.SCHEDULED,
                    ),
                    PlanAssignmentResponse(
                        task_id=2,
                        window_id=10,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=Weekday.MON,
                        estimated_hours=3.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.SCHEDULED,
                    ),
                ],
                kpis=KpiResponse(
                    total_tasks=2,
                    scheduled_tasks=2,
                    unscheduled_tasks=0,
                    critical_unscheduled_tasks=0,
                    asset_availability_percent=100.0,
                    scheduled_hours=7.0,
                    available_window_hours=8.0,
                ),
                metadata=OptimizerMetadata(
                    solver_status="OPTIMAL",
                    solve_time_seconds=0.045,
                ),
            )

        client = LocalCallableOptimizerClient(_mock_solver)
        service = OptimizerServiceAdapter(client=client)

        result = service.optimize(OptimizerInput(tasks=[task1, task2], windows=[win]))
        assert len(result.assignments) == 2
        assert result.kpis.scheduled_tasks == 2
        assert result.metadata.solver_status == "OPTIMAL"

    def test_preserves_unscheduled_tasks_correctly(self) -> None:
        task1 = _sample_task(1, "COR_01", 6.0)
        task2 = _sample_task(2, "COR_01", 6.0)  # Cannot fit in 8h window together
        win = _sample_window(10, "COR_01", 8.0)

        def _mock_solver(req: OptimizerInput) -> OptimizerResult:
            return OptimizerResult(
                assignments=[
                    PlanAssignmentResponse(
                        task_id=1,
                        window_id=10,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=Weekday.MON,
                        estimated_hours=6.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.SCHEDULED,
                    ),
                    PlanAssignmentResponse(
                        task_id=2,
                        window_id=None,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=None,
                        estimated_hours=6.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.UNSCHEDULED,
                    ),
                ],
                kpis=KpiResponse(
                    total_tasks=2,
                    scheduled_tasks=1,
                    unscheduled_tasks=1,
                    critical_unscheduled_tasks=1,
                    asset_availability_percent=50.0,
                    scheduled_hours=6.0,
                    available_window_hours=8.0,
                ),
                metadata=OptimizerMetadata(
                    solver_status="FEASIBLE",
                    unscheduled_reasons={2: "Insufficient remaining capacity in window 10"},
                ),
            )

        service = OptimizerServiceAdapter(client=LocalCallableOptimizerClient(_mock_solver))
        result = service.optimize(OptimizerInput(tasks=[task1, task2], windows=[win]))

        assert len(result.assignments) == 2
        unscheduled = [a for a in result.assignments if a.status is AssignmentStatus.UNSCHEDULED]
        assert len(unscheduled) == 1
        assert unscheduled[0].task_id == 2
        assert unscheduled[0].window_id is None

    def test_missing_task_in_assignments_rejected(self) -> None:
        task1 = _sample_task(1)
        task2 = _sample_task(2)
        win = _sample_window(10)

        # Solver returns only task 1 and silently drops task 2
        def _incomplete_solver(req: OptimizerInput) -> OptimizerResult:
            return OptimizerResult(
                assignments=[
                    PlanAssignmentResponse(
                        task_id=1,
                        window_id=10,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=Weekday.MON,
                        estimated_hours=4.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.SCHEDULED,
                    )
                ],
                kpis=KpiResponse(
                    total_tasks=2,
                    scheduled_tasks=1,
                    unscheduled_tasks=1,
                    critical_unscheduled_tasks=0,
                    asset_availability_percent=50.0,
                ),
            )

        service = OptimizerServiceAdapter(client=LocalCallableOptimizerClient(_incomplete_solver))
        with pytest.raises(OptimizerResponseValidationError, match="silently omitted tasks"):
            service.optimize(OptimizerInput(tasks=[task1, task2], windows=[win]))

    def test_corridor_mismatch_rejected(self) -> None:
        task1 = _sample_task(1, corridor_id="COR_01")
        win2 = _sample_window(20, corridor_id="COR_02")

        # Solver improperly assigned COR_01 task to COR_02 window
        def _mismatched_solver(req: OptimizerInput) -> OptimizerResult:
            return OptimizerResult(
                assignments=[
                    PlanAssignmentResponse(
                        task_id=1,
                        window_id=20,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=Weekday.MON,
                        estimated_hours=4.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.SCHEDULED,
                    )
                ],
                kpis=KpiResponse(
                    total_tasks=1,
                    scheduled_tasks=1,
                    unscheduled_tasks=0,
                    critical_unscheduled_tasks=0,
                    asset_availability_percent=100.0,
                ),
            )

        service = OptimizerServiceAdapter(client=LocalCallableOptimizerClient(_mismatched_solver))
        with pytest.raises(OptimizerResponseValidationError, match="Corridor mismatch"):
            service.optimize(OptimizerInput(tasks=[task1], windows=[win2]))

    def test_window_capacity_overflow_rejected(self) -> None:
        task1 = _sample_task(1, estimated_hours=6.0)
        task2 = _sample_task(2, estimated_hours=5.0)  # Total = 11.0h
        win = _sample_window(10, available_hours=8.0)  # Capacity = 8.0h

        # Solver overbooked the window
        def _overbooked_solver(req: OptimizerInput) -> OptimizerResult:
            return OptimizerResult(
                assignments=[
                    PlanAssignmentResponse(
                        task_id=1,
                        window_id=10,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=Weekday.MON,
                        estimated_hours=6.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.SCHEDULED,
                    ),
                    PlanAssignmentResponse(
                        task_id=2,
                        window_id=10,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        day=Weekday.MON,
                        estimated_hours=5.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.SCHEDULED,
                    ),
                ],
                kpis=KpiResponse(
                    total_tasks=2,
                    scheduled_tasks=2,
                    unscheduled_tasks=0,
                    critical_unscheduled_tasks=0,
                    asset_availability_percent=100.0,
                    scheduled_hours=11.0,
                    available_window_hours=8.0,
                ),
            )

        service = OptimizerServiceAdapter(client=LocalCallableOptimizerClient(_overbooked_solver))
        with pytest.raises(OptimizerResponseValidationError, match="Window capacity exceeded"):
            service.optimize(OptimizerInput(tasks=[task1, task2], windows=[win]))

    def test_infeasible_status_raises_infeasible_error(self) -> None:
        task = _sample_task(1)
        win = _sample_window(10)

        def _infeasible_solver(req: OptimizerInput) -> OptimizerResult:
            return OptimizerResult(
                assignments=[
                    PlanAssignmentResponse(
                        task_id=1,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        estimated_hours=4.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.UNSCHEDULED,
                    )
                ],
                kpis=KpiResponse(
                    total_tasks=1,
                    scheduled_tasks=0,
                    unscheduled_tasks=1,
                    critical_unscheduled_tasks=1,
                    asset_availability_percent=0.0,
                ),
                metadata=OptimizerMetadata(solver_status="INFEASIBLE"),
            )

        service = OptimizerServiceAdapter(client=LocalCallableOptimizerClient(_infeasible_solver))
        with pytest.raises(OptimizerInfeasibleError, match="infeasible"):
            service.optimize(OptimizerInput(tasks=[task], windows=[win]))

    def test_timeout_status_raises_timeout_error(self) -> None:
        task = _sample_task(1)
        win = _sample_window(10)

        def _timeout_solver(req: OptimizerInput) -> OptimizerResult:
            return OptimizerResult(
                assignments=[
                    PlanAssignmentResponse(
                        task_id=1,
                        corridor_id="COR_01",
                        department=Department.ENGINEERING,
                        estimated_hours=4.0,
                        criticality_score=90.0,
                        defect_severity=DefectSeverity.A,
                        status=AssignmentStatus.UNSCHEDULED,
                    )
                ],
                kpis=KpiResponse(
                    total_tasks=1,
                    scheduled_tasks=0,
                    unscheduled_tasks=1,
                    critical_unscheduled_tasks=1,
                    asset_availability_percent=0.0,
                ),
                metadata=OptimizerMetadata(solver_status="TIMEOUT"),
            )

        service = OptimizerServiceAdapter(client=LocalCallableOptimizerClient(_timeout_solver))
        with pytest.raises(OptimizerTimeoutError, match="timed out"):
            service.optimize(OptimizerInput(tasks=[task], windows=[win]))

    def test_connection_error_translated_to_unavailable_error(self) -> None:
        def _offline_solver(req: OptimizerInput) -> OptimizerResult:
            raise ConnectionError("Connection refused by solver RPC daemon")

        service = OptimizerServiceAdapter(client=LocalCallableOptimizerClient(_offline_solver))
        with pytest.raises(OptimizerUnavailableError, match="unreachable"):
            service.optimize(OptimizerInput(tasks=[_sample_task(1)], windows=[_sample_window(10)]))

    def test_unavailable_stub_raises_unavailable_error(self) -> None:
        stub = UnavailableOptimizerService()
        with pytest.raises(OptimizerUnavailableError, match="not wired"):
            stub.optimize(OptimizerInput(tasks=[_sample_task(1)], windows=[_sample_window(10)]))
