"""Explicit domain enumerations for the SIH26027 API contract."""

from enum import Enum


class Department(str, Enum):
    """Maintenance departments in the current prototype datasets."""

    ENGINEERING = "Engineering"
    TRACTION = "Traction"
    S_AND_T = "S&T"


class DefectSeverity(str, Enum):
    """Ordinal defect classes used by scoring (A is most severe)."""

    A = "A"
    B = "B"
    C = "C"


class Weekday(str, Enum):
    """Weekday labels used by the prototype window and schedule CSVs."""

    MON = "Mon"
    TUE = "Tue"
    WED = "Wed"
    THU = "Thu"
    FRI = "Fri"
    SAT = "Sat"
    SUN = "Sun"


class PlanningHorizonType(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class TaskStatus(str, Enum):
    """Lifecycle of a maintenance request in the planning API."""

    OPEN = "open"
    SCHEDULED = "scheduled"
    UNSCHEDULED = "unscheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PlanStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"
    SUPERSEDED = "superseded"


class AssignmentStatus(str, Enum):
    SCHEDULED = "scheduled"
    UNSCHEDULED = "unscheduled"
    OVERRIDDEN = "overridden"


class OverrideAction(str, Enum):
    REASSIGN = "reassign"
    FORCE_SCHEDULE = "force_schedule"
    UNSCHEDULE = "unschedule"


class ErrorCode(str, Enum):
    VALIDATION_ERROR = "validation_error"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    DEPENDENCY_NOT_READY = "dependency_not_ready"
    PLAN_GENERATION_FAILED = "plan_generation_failed"
    OVERRIDE_REJECTED = "override_rejected"
