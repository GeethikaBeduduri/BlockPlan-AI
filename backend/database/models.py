from __future__ import annotations

from datetime import UTC, date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MaintenanceTask(Base):
    __tablename__ = "maintenance_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    source_system: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(64), nullable=False)
    department: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    asset_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    corridor_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    defect_type: Mapped[str] = mapped_column(String(64), nullable=False)
    defect_severity: Mapped[str] = mapped_column(String(1), nullable=False, index=True)
    days_overdue: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_hours: Mapped[float] = mapped_column(Float, nullable=False)
    asset_age_years: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING", index=True)
    criticality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("source_system", "source_record_id", name="uq_task_source_record"),
        CheckConstraint("defect_severity IN ('A', 'B', 'C')", name="ck_task_severity"),
        CheckConstraint("days_overdue >= 0", name="ck_task_overdue"),
        CheckConstraint("estimated_hours > 0", name="ck_task_duration"),
        CheckConstraint("asset_age_years >= 0", name="ck_task_asset_age"),
    )


class BlockWindow(Base):
    __tablename__ = "block_windows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    window_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    source_system: Mapped[str] = mapped_column(String(16), nullable=False, default="COA")
    source_record_id: Mapped[str] = mapped_column(String(64), nullable=False)
    corridor_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    window_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    available_hours: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="AVAILABLE", index=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("source_system", "source_record_id", name="uq_window_source_record"),
        CheckConstraint("available_hours > 0", name="ck_window_hours"),
        CheckConstraint("end_time > start_time", name="ck_window_time"),
    )


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_system: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="RUNNING")
    records_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    records_loaded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)

class BlockPlan(Base):
    __tablename__ = "block_plans"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )

    horizon_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
    )

    horizon_start: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    horizon_end: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    corridor_id: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    department: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="PENDING",
    )

    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    approved_by: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    failure_reason: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "horizon_type IN ('DAILY', 'WEEKLY', 'MONTHLY')",
            name="ck_block_plans_horizon_type",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'READY', 'FAILED')",
            name="ck_block_plans_status",
        ),
        CheckConstraint(
            "horizon_end >= horizon_start",
            name="ck_block_plans_horizon_dates",
        ),
    )


class PlanAssignment(Base):
    __tablename__ = "plan_assignments"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )

    plan_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "block_plans.id",
            ondelete="CASCADE",
            name="fk_plan_assignments_plan",
        ),
        nullable=False,
    )

    task_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "maintenance_tasks.id",
            ondelete="RESTRICT",
            name="fk_plan_assignments_task",
        ),
        nullable=False,
    )

    window_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "block_windows.id",
            ondelete="RESTRICT",
            name="fk_plan_assignments_window",
        ),
        nullable=False,
    )

    department: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )

    joint_block_flag: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="ASSIGNED",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "plan_id",
            "task_id",
            name="uq_plan_task",
        ),
    )


class PlannerOverride(Base):
    __tablename__ = "planner_overrides"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )

    plan_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "block_plans.id",
            ondelete="CASCADE",
            name="fk_planner_overrides_plan",
        ),
        nullable=False,
    )

    assignment_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "plan_assignments.id",
            ondelete="CASCADE",
            name="fk_planner_overrides_assignment",
        ),
        nullable=False,
    )

    task_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "maintenance_tasks.id",
            ondelete="RESTRICT",
            name="fk_planner_overrides_task",
        ),
        nullable=False,
    )

    action: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
    )

    target_window_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "block_windows.id",
            ondelete="RESTRICT",
            name="fk_planner_overrides_target_window",
        ),
        nullable=True,
    )

    reason: Mapped[str] = mapped_column(
        String(1000),
        nullable=False,
    )

    overridden_by: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "action IN ('UNSCHEDULE', 'REASSIGN', 'FORCE_SCHEDULE')",
            name="ck_planner_overrides_action",
        ),
    )