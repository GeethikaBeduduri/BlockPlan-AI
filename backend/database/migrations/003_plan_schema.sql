-- Generated block-plan persistence schema.
-- Depends on:
--   maintenance_tasks.id
--   block_windows.id

CREATE TABLE block_plans (
    id BIGSERIAL PRIMARY KEY,

    horizon_type VARCHAR(16) NOT NULL,
    horizon_start DATE NOT NULL,
    horizon_end DATE NOT NULL,

    corridor_id VARCHAR(32),
    department VARCHAR(32),

    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',

    generated_at TIMESTAMPTZ,
    approved_by VARCHAR(128),
    approved_at TIMESTAMPTZ,

    failure_reason VARCHAR(1000),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_block_plans_horizon_type
        CHECK (horizon_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),

    CONSTRAINT ck_block_plans_horizon_dates
        CHECK (horizon_end >= horizon_start),

    CONSTRAINT ck_block_plans_status
        CHECK (status IN ('PENDING', 'READY', 'FAILED'))
);

CREATE INDEX idx_block_plans_status
    ON block_plans(status);

CREATE INDEX idx_block_plans_horizon
    ON block_plans(horizon_start, horizon_end);

CREATE INDEX idx_block_plans_corridor
    ON block_plans(corridor_id);


CREATE TABLE plan_assignments (
    id BIGSERIAL PRIMARY KEY,

    plan_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL,
    window_id BIGINT NOT NULL,

    department VARCHAR(32) NOT NULL,

    joint_block_flag BOOLEAN NOT NULL DEFAULT FALSE,

    status VARCHAR(16) NOT NULL DEFAULT 'ASSIGNED',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_plan_assignments_plan
        FOREIGN KEY (plan_id)
        REFERENCES block_plans(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_plan_assignments_task
        FOREIGN KEY (task_id)
        REFERENCES maintenance_tasks(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_plan_assignments_window
        FOREIGN KEY (window_id)
        REFERENCES block_windows(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_plan_assignments_status
        CHECK (status IN ('ASSIGNED', 'OVERRIDDEN', 'CANCELLED')),

    CONSTRAINT uq_plan_task
        UNIQUE (plan_id, task_id)
);

CREATE INDEX idx_plan_assignments_plan
    ON plan_assignments(plan_id);

CREATE INDEX idx_plan_assignments_task
    ON plan_assignments(task_id);

CREATE INDEX idx_plan_assignments_window
    ON plan_assignments(window_id);


CREATE TABLE planner_overrides (
    id BIGSERIAL PRIMARY KEY,

    plan_id BIGINT NOT NULL,
    assignment_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL,

    action VARCHAR(24) NOT NULL,

    target_window_id BIGINT,

    reason VARCHAR(1000) NOT NULL,
    overridden_by VARCHAR(128) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_planner_overrides_plan
        FOREIGN KEY (plan_id)
        REFERENCES block_plans(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_planner_overrides_assignment
        FOREIGN KEY (assignment_id)
        REFERENCES plan_assignments(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_planner_overrides_task
        FOREIGN KEY (task_id)
        REFERENCES maintenance_tasks(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_planner_overrides_target_window
        FOREIGN KEY (target_window_id)
        REFERENCES block_windows(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_planner_overrides_action
        CHECK (
            action IN (
                'UNSCHEDULE',
                'REASSIGN',
                'FORCE_SCHEDULE'
            )
        )
);

CREATE INDEX idx_planner_overrides_plan
    ON planner_overrides(plan_id);

CREATE INDEX idx_planner_overrides_assignment
    ON planner_overrides(assignment_id);

CREATE INDEX idx_planner_overrides_task
    ON planner_overrides(task_id);