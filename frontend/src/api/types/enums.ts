/**
 * Backend enum types.
 * Values mirror the Python Enum members in app/schemas/enums.py exactly.
 * DO NOT add values that do not exist in the backend.
 */

/** app/schemas/enums.py – Department */
export type Department = 'Engineering' | 'Traction' | 'S&T';

/** app/schemas/enums.py – DefectSeverity */
export type DefectSeverity = 'A' | 'B' | 'C';

/** app/schemas/enums.py – Weekday */
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

/** app/schemas/enums.py – PlanningHorizonType */
export type PlanningHorizonType = 'daily' | 'weekly' | 'monthly';

/** app/schemas/enums.py – TaskStatus */
export type TaskStatus = 'open' | 'scheduled' | 'unscheduled' | 'completed' | 'cancelled';

/** app/schemas/enums.py – PlanStatus */
export type PlanStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'superseded';

/** app/schemas/enums.py – AssignmentStatus */
export type AssignmentStatus = 'scheduled' | 'unscheduled' | 'overridden';

/** app/schemas/enums.py – OverrideAction */
export type OverrideAction = 'reassign' | 'force_schedule' | 'unschedule';

/** app/schemas/enums.py – ErrorCode */
export type ErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'dependency_not_ready'
  | 'plan_generation_failed'
  | 'override_rejected';
