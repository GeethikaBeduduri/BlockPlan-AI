/**
 * Unit Tests for Frontend Adapters and Formatters.
 *
 * Validates:
 * - Exact DTO preservation (raw payload intact, numeric IDs unchanged)
 * - Correct presentation mappings for all domain enums
 * - Criticality score tiers (Critical, High, Medium, Low, Unscored)
 * - Safe handling of nulls/optionals in dates, scores, and window IDs
 * - Pagination calculations (page number, total pages, hasMore)
 * - Non-recalculated KPI values (percentages passed directly from backend)
 */

import { describe, expect, it } from 'vitest';

import type {
  BlockPlanResponse,
  CriticalTasksKpiResponse,
  KpiResponse,
  MaintenanceTaskListResponse,
  MaintenanceTaskResponse,
  PlanAssignmentResponse,
  PlanJobResponse,
  PlannerOverrideResponse,
  UnscheduledCriticalTaskResponse,
} from '../../api/types';
import {
  formatAssignmentStatus,
  formatCriticalityScore,
  formatDefectSeverity,
  formatDepartment,
  formatDuration,
  formatHorizonType,
  formatIsoDate,
  formatIsoDateTime,
  formatOverrideAction,
  formatOverrideId,
  formatPlanId,
  formatPlanStatus,
  formatTaskId,
  formatTaskStatus,
  formatWeekday,
  formatWindowId,
  getCriticalityBadge,
  getCriticalityLevel,
  getDepartmentColor,
  getDepartmentShort,
  getSeverityBadge,
  parseIsoDate,
} from '../formatters';
import {
  adaptCriticalTasksKpi,
  adaptKpi,
  adaptUnscheduledCriticalTask,
} from '../kpiAdapter';
import { adaptPlannerOverride } from '../overrideAdapter';
import {
  adaptBlockPlan,
  adaptPlanAssignment,
  adaptPlanJob,
} from '../planAdapter';
import { adaptTask, adaptTaskList } from '../taskAdapter';

// ---------------------------------------------------------------------------
// 1. Formatters Tests
// ---------------------------------------------------------------------------

describe('Formatters - Identifiers', () => {
  it('formats task IDs with zero-padding', () => {
    expect(formatTaskId(1)).toBe('TSK-0001');
    expect(formatTaskId(42)).toBe('TSK-0042');
    expect(formatTaskId(9999)).toBe('TSK-9999');
  });

  it('formats window IDs with fallback for null', () => {
    expect(formatWindowId(5)).toBe('WIN-0005');
    expect(formatWindowId(null)).toBe('—');
  });

  it('formats plan IDs with fallback for null', () => {
    expect(formatPlanId(12)).toBe('PLAN-0012');
    expect(formatPlanId(null)).toBe('—');
  });

  it('formats override IDs', () => {
    expect(formatOverrideId(3)).toBe('OVR-0003');
  });
});

describe('Formatters - Departments', () => {
  it('formats Engineering department display and tokens', () => {
    expect(formatDepartment('Engineering')).toBe('Engineering (Track & Civil)');
    expect(getDepartmentShort('Engineering')).toBe('ENG');
    expect(getDepartmentColor('Engineering')).toBe('#2563eb');
  });

  it('formats Traction department display and tokens', () => {
    expect(formatDepartment('Traction')).toBe('Traction (OHE & Power)');
    expect(getDepartmentShort('Traction')).toBe('TRC');
    expect(getDepartmentColor('Traction')).toBe('#7c3aed');
  });

  it('formats S&T department display and tokens', () => {
    expect(formatDepartment('S&T')).toBe('Signal & Telecom (S&T)');
    expect(getDepartmentShort('S&T')).toBe('S&T');
    expect(getDepartmentColor('S&T')).toBe('#0891b2');
  });
});

describe('Formatters - Defect Severity', () => {
  it('formats Severity A (Critical)', () => {
    expect(formatDefectSeverity('A')).toBe('Class A (Critical / Immediate)');
    const badge = getSeverityBadge('A');
    expect(badge.label).toBe('Severity A');
    expect(badge.color).toBe('#dc2626');
  });

  it('formats Severity B (Major)', () => {
    expect(formatDefectSeverity('B')).toBe('Class B (Major / Urgent)');
    const badge = getSeverityBadge('B');
    expect(badge.label).toBe('Severity B');
    expect(badge.color).toBe('#ea580c');
  });

  it('formats Severity C (Minor)', () => {
    expect(formatDefectSeverity('C')).toBe('Class C (Minor / Routine)');
    const badge = getSeverityBadge('C');
    expect(badge.label).toBe('Severity C');
    expect(badge.color).toBe('#16a34a');
  });
});

describe('Formatters - Criticality Scoring Tiers', () => {
  it('identifies Critical tier (score >= 90)', () => {
    expect(getCriticalityLevel(95.5)).toBe('Critical');
    expect(getCriticalityLevel(90.0)).toBe('Critical');
    const badge = getCriticalityBadge(92.0);
    expect(badge.label).toBe('Critical');
    expect(badge.color).toBe('#dc2626');
  });

  it('identifies High tier (70 <= score < 90)', () => {
    expect(getCriticalityLevel(89.9)).toBe('High');
    expect(getCriticalityLevel(70.0)).toBe('High');
    const badge = getCriticalityBadge(75.0);
    expect(badge.label).toBe('High');
    expect(badge.color).toBe('#ea580c');
  });

  it('identifies Medium tier (40 <= score < 70)', () => {
    expect(getCriticalityLevel(69.9)).toBe('Medium');
    expect(getCriticalityLevel(40.0)).toBe('Medium');
    const badge = getCriticalityBadge(50.0);
    expect(badge.label).toBe('Medium');
    expect(badge.color).toBe('#d97706');
  });

  it('identifies Low tier (score < 40)', () => {
    expect(getCriticalityLevel(39.9)).toBe('Low');
    expect(getCriticalityLevel(0)).toBe('Low');
    const badge = getCriticalityBadge(15.0);
    expect(badge.label).toBe('Low');
    expect(badge.color).toBe('#16a34a');
  });

  it('identifies Unscored tier (null / undefined)', () => {
    expect(getCriticalityLevel(null)).toBe('Unscored');
    const badge = getCriticalityBadge(null);
    expect(badge.label).toBe('Unscored');
    expect(formatCriticalityScore(null)).toBe('—');
  });

  it('formats numerical score with 1 decimal place', () => {
    expect(formatCriticalityScore(87.42)).toBe('87.4');
  });
});

describe('Formatters - Statuses & Actions', () => {
  it('formats TaskStatus enums', () => {
    expect(formatTaskStatus('open')).toBe('Open');
    expect(formatTaskStatus('scheduled')).toBe('Scheduled');
    expect(formatTaskStatus('unscheduled')).toBe('Unscheduled');
    expect(formatTaskStatus('completed')).toBe('Completed');
    expect(formatTaskStatus('cancelled')).toBe('Cancelled');
  });

  it('formats PlanStatus enums', () => {
    expect(formatPlanStatus('pending')).toBe('Pending (Queued)');
    expect(formatPlanStatus('generating')).toBe('Generating (Optimizing)');
    expect(formatPlanStatus('ready')).toBe('Ready (Available)');
    expect(formatPlanStatus('failed')).toBe('Failed');
    expect(formatPlanStatus('superseded')).toBe('Superseded');
  });

  it('formats AssignmentStatus enums', () => {
    expect(formatAssignmentStatus('scheduled')).toBe('AI Scheduled');
    expect(formatAssignmentStatus('unscheduled')).toBe('Unscheduled');
    expect(formatAssignmentStatus('overridden')).toBe('Planner Overridden');
  });

  it('formats OverrideAction enums', () => {
    expect(formatOverrideAction('reassign')).toBe('Reassign Window');
    expect(formatOverrideAction('force_schedule')).toBe('Force Schedule');
    expect(formatOverrideAction('unschedule')).toBe('Remove / Unschedule');
  });

  it('formats HorizonType enums', () => {
    expect(formatHorizonType('daily')).toBe('Daily Horizon (24h)');
    expect(formatHorizonType('weekly')).toBe('Weekly Horizon (7 Days)');
    expect(formatHorizonType('monthly')).toBe('Monthly Horizon (30 Days)');
    expect(formatHorizonType(null)).toBe('—');
  });

  it('formats Weekdays', () => {
    expect(formatWeekday('Mon')).toBe('Monday');
    expect(formatWeekday('Fri')).toBe('Friday');
    expect(formatWeekday(null)).toBe('—');
  });
});

describe('Formatters - Dates & Durations', () => {
  it('formats duration in hours to compact h/m string', () => {
    expect(formatDuration(2.5)).toBe('2h 30m');
    expect(formatDuration(1.0)).toBe('1h');
    expect(formatDuration(0.75)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('parses and formats ISO dates safely', () => {
    expect(parseIsoDate('2026-08-29')).toBeInstanceOf(Date);
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate('invalid-date')).toBeNull();
    expect(formatIsoDate('2026-08-29T10:30:00Z')).toBe('2026-08-29');
    expect(formatIsoDate(null)).toBe('—');
    expect(formatIsoDateTime('2026-08-29T10:30:00Z')).toBe('2026-08-29 10:30');
    expect(formatIsoDateTime(null)).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// 2. Task Adapter Tests
// ---------------------------------------------------------------------------

describe('Task Adapter - adaptTask & adaptTaskList', () => {
  const taskDto: MaintenanceTaskResponse = {
    task_id: 101,
    department: 'Engineering',
    corridor_id: 'COR_01',
    defect_severity: 'A',
    days_overdue: 4,
    estimated_hours: 2.5,
    asset_age_years: 8,
    status: 'open',
    criticality_score: 92.5,
    created_at: '2026-08-20T14:30:00Z',
    updated_at: '2026-08-21T09:00:00Z',
  };

  it('preserves numeric task_id and raw DTO', () => {
    const vm = adaptTask(taskDto);
    expect(vm.id).toBe(101);
    expect(vm.formattedId).toBe('TSK-0101');
    expect(vm.raw).toEqual(taskDto);
  });

  it('converts duration to minutes and formatted string', () => {
    const vm = adaptTask(taskDto);
    expect(vm.estimatedHours).toBe(2.5);
    expect(vm.estimatedMinutes).toBe(150);
    expect(vm.estimatedDurationFormatted).toBe('2h 30m');
  });

  it('evaluates overdue status correctly', () => {
    const vm = adaptTask(taskDto);
    expect(vm.daysOverdue).toBe(4);
    expect(vm.isOverdue).toBe(true);

    const nonOverdue = adaptTask({ ...taskDto, days_overdue: 0 });
    expect(nonOverdue.isOverdue).toBe(false);
  });

  it('adapts task list with pagination calculations', () => {
    const listDto: MaintenanceTaskListResponse = {
      items: [taskDto],
      meta: { limit: 10, offset: 20, total: 45 },
    };

    const listVm = adaptTaskList(listDto);
    expect(listVm.items).toHaveLength(1);
    expect(listVm.total).toBe(45);
    expect(listVm.limit).toBe(10);
    expect(listVm.offset).toBe(20);
    expect(listVm.page).toBe(3); // offset 20 with limit 10 => page 3
    expect(listVm.totalPages).toBe(5); // ceil(45 / 10) = 5
    expect(listVm.hasMore).toBe(true);
  });

  it('handles empty task list correctly', () => {
    const emptyList: MaintenanceTaskListResponse = {
      items: [],
      meta: { limit: 50, offset: 0, total: 0 },
    };
    const listVm = adaptTaskList(emptyList);
    expect(listVm.items).toHaveLength(0);
    expect(listVm.page).toBe(1);
    expect(listVm.totalPages).toBe(1);
    expect(listVm.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Plan Adapter Tests
// ---------------------------------------------------------------------------

describe('Plan Adapter - adaptBlockPlan & adaptPlanAssignment', () => {
  const assignmentDto: PlanAssignmentResponse = {
    task_id: 101,
    window_id: 3,
    corridor_id: 'COR_01',
    department: 'Engineering',
    day: 'Tue',
    estimated_hours: 2.0,
    criticality_score: 88.0,
    defect_severity: 'A',
    status: 'scheduled',
  };

  const planDto: BlockPlanResponse = {
    plan_id: 7,
    status: 'ready',
    horizon_type: 'weekly',
    horizon_start: '2026-08-25',
    horizon_end: '2026-08-31',
    assignments: [
      assignmentDto,
      {
        task_id: 102,
        window_id: null,
        corridor_id: 'COR_01',
        department: 'S&T',
        day: null,
        estimated_hours: 1.5,
        criticality_score: 45.0,
        defect_severity: 'C',
        status: 'unscheduled',
      },
    ],
    kpis: {
      plan_id: 7,
      horizon_type: 'weekly',
      horizon_start: '2026-08-25',
      horizon_end: '2026-08-31',
      corridor_id: null,
      department: null,
      total_tasks: 2,
      scheduled_tasks: 1,
      unscheduled_tasks: 1,
      critical_unscheduled_tasks: 0,
      asset_availability_percent: 50.0,
      scheduled_hours: 2.0,
      available_window_hours: 4.0,
      block_utilization_percent: 50.0,
      plan_generation_seconds: 2.45,
    },
    generated_at: '2026-08-25T08:00:00Z',
    created_at: '2026-08-25T07:59:00Z',
    updated_at: '2026-08-25T08:00:00Z',
  };

  it('adapts scheduled assignment correctly', () => {
    const vm = adaptPlanAssignment(assignmentDto);
    expect(vm.taskId).toBe(101);
    expect(vm.windowId).toBe(3);
    expect(vm.formattedWindowId).toBe('WIN-0003');
    expect(vm.isScheduled).toBe(true);
    expect(vm.isOverridden).toBe(false);
    expect(vm.dayDisplay).toBe('Tuesday');
  });

  it('adapts unscheduled assignment correctly', () => {
    const unscheduledDto: PlanAssignmentResponse = {
      task_id: 102,
      window_id: null,
      corridor_id: 'COR_01',
      department: 'S&T',
      day: null,
      estimated_hours: 1.5,
      criticality_score: 45.0,
      defect_severity: 'C',
      status: 'unscheduled',
    };
    const vm = adaptPlanAssignment(unscheduledDto);
    expect(vm.windowId).toBeNull();
    expect(vm.formattedWindowId).toBe('—');
    expect(vm.isScheduled).toBe(false);
    expect(vm.dayDisplay).toBe('—');
  });

  it('adapts block plan and separates scheduled from unscheduled', () => {
    const planVm = adaptBlockPlan(planDto);
    expect(planVm.planId).toBe(7);
    expect(planVm.formattedPlanId).toBe('PLAN-0007');
    expect(planVm.isReady).toBe(true);
    expect(planVm.isGenerating).toBe(false);
    expect(planVm.totalTasksCount).toBe(2);
    expect(planVm.scheduledTasksCount).toBe(1);
    expect(planVm.unscheduledTasksCount).toBe(1);
    expect(planVm.scheduledAssignments[0].taskId).toBe(101);
    expect(planVm.unscheduledAssignments[0].taskId).toBe(102);
    expect(planVm.horizonSpanDays).toBe(7);
  });

  it('adapts plan job response', () => {
    const jobDto: PlanJobResponse = {
      accepted: true,
      job_id: 'celery-1234',
      plan_id: 7,
      horizon_type: 'weekly',
      status: 'pending',
    };
    const jobVm = adaptPlanJob(jobDto);
    expect(jobVm.accepted).toBe(true);
    expect(jobVm.jobId).toBe('celery-1234');
    expect(jobVm.planId).toBe(7);
    expect(jobVm.formattedPlanId).toBe('PLAN-0007');
    expect(jobVm.statusDisplay).toBe('Pending (Queued)');
  });
});

// ---------------------------------------------------------------------------
// 4. KPI Adapter Tests
// ---------------------------------------------------------------------------

describe('KPI Adapter - adaptKpi & adaptCriticalTasksKpi', () => {
  const kpiDto: KpiResponse = {
    plan_id: 10,
    horizon_type: 'daily',
    horizon_start: '2026-08-29',
    horizon_end: '2026-08-29',
    corridor_id: 'COR_01',
    department: 'Engineering',
    total_tasks: 20,
    scheduled_tasks: 18,
    unscheduled_tasks: 2,
    critical_unscheduled_tasks: 0,
    asset_availability_percent: 90.0,
    scheduled_hours: 36.0,
    available_window_hours: 40.0,
    block_utilization_percent: 90.0,
    plan_generation_seconds: 1.82,
  };

  it('preserves exact float percentages from backend without recalculation', () => {
    const vm = adaptKpi(kpiDto);
    expect(vm.assetAvailabilityPercent).toBe(90.0);
    expect(vm.assetAvailabilityFormatted).toBe('90.0%');
    expect(vm.blockUtilizationPercent).toBe(90.0);
    expect(vm.blockUtilizationFormatted).toBe('90.0%');
    expect(vm.planGenerationSeconds).toBe(1.82);
    expect(vm.planGenerationFormatted).toBe('1.82s');
  });

  it('handles null plan generation seconds', () => {
    const vm = adaptKpi({ ...kpiDto, plan_generation_seconds: null });
    expect(vm.planGenerationSeconds).toBeNull();
    expect(vm.planGenerationFormatted).toBe('—');
  });

  it('adapts critical tasks KPI list', () => {
    const task: UnscheduledCriticalTaskResponse = {
      plan_id: 10,
      task_id: 55,
      department: 'Traction',
      corridor_id: 'COR_01',
      defect_severity: 'A',
      days_overdue: 7,
      estimated_hours: 3.0,
      criticality_score: 96.0,
      status: 'unscheduled',
    };
    const criticalDto: CriticalTasksKpiResponse = {
      items: [task],
      meta: { limit: 50, offset: 0, total: 1 },
    };

    const singleVm = adaptUnscheduledCriticalTask(task);
    expect(singleVm.taskId).toBe(55);
    expect(singleVm.formattedTaskId).toBe('TSK-0055');
    expect(singleVm.defectSeverityDisplay).toBe('Class A (Critical / Immediate)');

    const vm = adaptCriticalTasksKpi(criticalDto);
    expect(vm.items).toHaveLength(1);
    expect(vm.items[0].taskId).toBe(55);
    expect(vm.items[0].formattedTaskId).toBe('TSK-0055');
    expect(vm.items[0].criticalityLevel).toBe('Critical');
    expect(vm.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Override Adapter Tests
// ---------------------------------------------------------------------------

describe('Override Adapter - adaptPlannerOverride', () => {
  it('adapts reassign override with target window', () => {
    const overrideDto: PlannerOverrideResponse = {
      override_id: 1,
      plan_id: 7,
      task_id: 101,
      action: 'reassign',
      target_window_id: 5,
      reason: 'Urgent rail replacement needed before peak passenger service.',
      overridden_by: 'CP_DELHI_01',
      overridden_at: '2026-08-29T11:00:00Z',
    };

    const vm = adaptPlannerOverride(overrideDto);
    expect(vm.overrideId).toBe(1);
    expect(vm.planId).toBe(7);
    expect(vm.taskId).toBe(101);
    expect(vm.formattedTaskId).toBe('TSK-0101');
    expect(vm.action).toBe('reassign');
    expect(vm.actionDisplay).toBe('Reassign Window');
    expect(vm.targetWindowId).toBe(5);
    expect(vm.formattedTargetWindowId).toBe('WIN-0005');
    expect(vm.overriddenBy).toBe('CP_DELHI_01');
    expect(vm.overriddenByDisplay).toBe('CP_DELHI_01');
    expect(vm.raw).toEqual(overrideDto);
  });

  it('adapts unschedule override with null target window and default user display', () => {
    const overrideDto: PlannerOverrideResponse = {
      override_id: 2,
      plan_id: 7,
      task_id: 102,
      action: 'unschedule',
      target_window_id: null,
      reason: 'Machinery unavailable for the designated window.',
      overridden_by: null,
      overridden_at: null,
    };

    const vm = adaptPlannerOverride(overrideDto);
    expect(vm.action).toBe('unschedule');
    expect(vm.actionDisplay).toBe('Remove / Unschedule');
    expect(vm.targetWindowId).toBeNull();
    expect(vm.formattedTargetWindowId).toBe('—');
    expect(vm.overriddenByDisplay).toBe('Chief Controller / Planner');
    expect(vm.overriddenAtFormatted).toBe('—');
  });
});
