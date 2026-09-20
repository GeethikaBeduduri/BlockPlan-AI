/**
 * Unit Tests for ganttAdapter.
 *
 * Covers:
 *  - Basic BlockPlanResponse → GanttPlanViewModel mapping
 *  - Task grouping by window_id into Gantt blocks
 *  - Correct start offset and duration calculations
 *  - Joint/shared block detection (>=2 distinct departments)
 *  - Partitioning of scheduled vs unscheduled assignments
 *  - Corridor row grouping
 *  - Handling empty plans and unscheduled-only plans
 */

import { describe, expect, it } from 'vitest';
import { adaptBlockPlanToGantt } from '../ganttAdapter';
import type { BlockPlanResponse, PlanAssignmentResponse } from '../../api/types/models';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const engAssignment: PlanAssignmentResponse = {
  task_id: 101,
  window_id: 1,
  corridor_id: 'COR_01',
  department: 'Engineering',
  day: 'Mon',
  estimated_hours: 2.0,
  criticality_score: 95.0,
  defect_severity: 'A',
  status: 'scheduled',
};

const tractionAssignment: PlanAssignmentResponse = {
  task_id: 102,
  window_id: 1,
  corridor_id: 'COR_01',
  department: 'Traction',
  day: 'Mon',
  estimated_hours: 1.5,
  criticality_score: 80.0,
  defect_severity: 'B',
  status: 'scheduled',
};

const sntAssignmentDifferentWindow: PlanAssignmentResponse = {
  task_id: 103,
  window_id: 2,
  corridor_id: 'COR_02',
  department: 'S&T',
  day: 'Tue',
  estimated_hours: 1.0,
  criticality_score: 60.0,
  defect_severity: 'C',
  status: 'scheduled',
};

const unscheduledAssignment: PlanAssignmentResponse = {
  task_id: 104,
  window_id: null,
  corridor_id: 'COR_01',
  department: 'Engineering',
  day: null,
  estimated_hours: 3.0,
  criticality_score: 40.0,
  defect_severity: 'C',
  status: 'unscheduled',
};

const samplePlan: BlockPlanResponse = {
  plan_id: 42,
  status: 'ready',
  horizon_type: 'weekly',
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  assignments: [
    engAssignment,
    tractionAssignment,
    sntAssignmentDifferentWindow,
    unscheduledAssignment,
  ],
  kpis: {
    plan_id: 42,
    horizon_type: 'weekly',
    horizon_start: '2026-08-25',
    horizon_end: '2026-08-31',
    corridor_id: null,
    department: null,
    total_tasks: 4,
    scheduled_tasks: 3,
    unscheduled_tasks: 1,
    critical_unscheduled_tasks: 0,
    scheduled_hours: 4.5,
    available_window_hours: 8.0,
    block_utilization_percent: 87.5,
    asset_availability_percent: 94.2,
    plan_generation_seconds: 4.5,
  },
  generated_at: '2026-08-25T10:00:00Z',
  created_at: '2026-08-25T09:59:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ganttAdapter — adaptBlockPlanToGantt', () => {
  it('maps basic plan metadata correctly', () => {
    const vm = adaptBlockPlanToGantt(samplePlan);

    expect(vm.planId).toBe(42);
    expect(vm.formattedPlanId).toBe('PLAN-0042');
    expect(vm.status).toBe('ready');
    expect(vm.isReady).toBe(true);
    expect(vm.isFailed).toBe(false);
    expect(vm.horizonType).toBe('weekly');
    expect(vm.horizonTypeDisplay).toBe('Weekly Horizon (7 Days)');
    expect(vm.horizonDateRangeFormatted).toBe('2026-08-25 → 2026-08-31');
  });

  it('partitions scheduled vs unscheduled assignments', () => {
    const vm = adaptBlockPlanToGantt(samplePlan);

    expect(vm.totalScheduledTasks).toBe(3);
    expect(vm.totalUnscheduledTasks).toBe(1);
    expect(vm.scheduledAssignments).toHaveLength(3);
    expect(vm.unscheduledAssignments).toHaveLength(1);
    expect(vm.unscheduledAssignments[0]?.taskId).toBe(104);
  });

  it('groups scheduled assignments into window blocks', () => {
    const vm = adaptBlockPlanToGantt(samplePlan);

    // Window 1 and Window 2
    expect(vm.blocks).toHaveLength(2);

    const win1 = vm.blocks.find((b) => b.windowId === 1);
    expect(win1).toBeDefined();
    expect(win1?.corridorId).toBe('COR_01');
    expect(win1?.day).toBe('Mon');
    expect(win1?.tasks).toHaveLength(2);

    const win2 = vm.blocks.find((b) => b.windowId === 2);
    expect(win2).toBeDefined();
    expect(win2?.corridorId).toBe('COR_02');
    expect(win2?.day).toBe('Tue');
    expect(win2?.tasks).toHaveLength(1);
  });

  it('identifies joint/shared blocks when multiple departments share a window', () => {
    const vm = adaptBlockPlanToGantt(samplePlan);

    const win1 = vm.blocks.find((b) => b.windowId === 1);
    expect(win1?.isShared).toBe(true);
    expect(win1?.departments).toContain('Engineering');
    expect(win1?.departments).toContain('Traction');

    const win2 = vm.blocks.find((b) => b.windowId === 2);
    expect(win2?.isShared).toBe(false);
    expect(win2?.departments).toEqual(['S&T']);
  });

  it('sequences tasks inside a window block with accurate offsets and durations', () => {
    const vm = adaptBlockPlanToGantt(samplePlan);
    const win1 = vm.blocks.find((b) => b.windowId === 1)!;

    const task1 = win1.tasks[0]!;
    expect(task1.taskId).toBe(101);
    expect(task1.durationHours).toBe(2.0);
    expect(task1.durationMinutes).toBe(120);
    expect(task1.startOffsetMinutes).toBe(0);

    const task2 = win1.tasks[1]!;
    expect(task2.taskId).toBe(102);
    expect(task2.durationHours).toBe(1.5);
    expect(task2.durationMinutes).toBe(90);
    expect(task2.startOffsetMinutes).toBe(120); // starts after task 1
  });

  it('groups blocks into corridor rows', () => {
    const vm = adaptBlockPlanToGantt(samplePlan);

    expect(vm.corridorRows).toHaveLength(2);
    expect(vm.corridorRows[0]?.corridorId).toBe('COR_01');
    expect(vm.corridorRows[0]?.blocks).toHaveLength(1);
    expect(vm.corridorRows[1]?.corridorId).toBe('COR_02');
    expect(vm.corridorRows[1]?.blocks).toHaveLength(1);
  });

  it('handles empty assignments cleanly without crashing', () => {
    const emptyPlan: BlockPlanResponse = {
      plan_id: 10,
      status: 'ready',
      horizon_type: 'daily',
      horizon_start: '2026-08-25',
      horizon_end: '2026-08-25',
      assignments: [],
      kpis: null,
      generated_at: null,
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T00:00:00Z',
    };

    const vm = adaptBlockPlanToGantt(emptyPlan);
    expect(vm.blocks).toHaveLength(0);
    expect(vm.corridorRows).toHaveLength(0);
    expect(vm.totalScheduledTasks).toBe(0);
    expect(vm.totalUnscheduledTasks).toBe(0);
  });

  it('handles plan with only unscheduled tasks', () => {
    const unscheduledOnlyPlan: BlockPlanResponse = {
      ...samplePlan,
      assignments: [unscheduledAssignment],
    };

    const vm = adaptBlockPlanToGantt(unscheduledOnlyPlan);
    expect(vm.blocks).toHaveLength(0);
    expect(vm.totalScheduledTasks).toBe(0);
    expect(vm.totalUnscheduledTasks).toBe(1);
  });
});
