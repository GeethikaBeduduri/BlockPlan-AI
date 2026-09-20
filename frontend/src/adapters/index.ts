/**
 * Public barrel for the adapters module.
 *
 * Usage:
 *   import { adaptTask, adaptBlockPlan, adaptKpi, formatDepartment } from '@/adapters';
 *   import type { TaskViewModel, BlockPlanViewModel, KpiViewModel } from '@/adapters';
 */

export * from './types';
export * from './formatters';
export * from './taskAdapter';
export * from './planAdapter';
export * from './kpiAdapter';
export * from './overrideAdapter';
export {
  adaptAssignmentsToWindows,
  buildCorridorSummaries,
} from './windowAdapter';
export * from './ganttAdapter';
