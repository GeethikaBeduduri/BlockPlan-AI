/**
 * Presentation Formatters and Enum Adaptation Utilities.
 *
 * Converts raw backend domain enumerations and numerical values into
 * readable UI labels, badge styling tokens, and localized timestamps.
 */

import type {
  AssignmentStatus,
  DefectSeverity,
  Department,
  OverrideAction,
  PlanningHorizonType,
  PlanStatus,
  TaskStatus,
  Weekday,
} from '../api/types';
import type { BadgeStyle, CriticalityLevel } from './types';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export function formatTaskId(id: number): string {
  return `TSK-${String(id).padStart(4, '0')}`;
}

export function formatWindowId(id: number | null): string {
  if (id === null || id === undefined) return '—';
  return `WIN-${String(id).padStart(4, '0')}`;
}

export function formatPlanId(id: number | null): string {
  if (id === null || id === undefined) return '—';
  return `PLAN-${String(id).padStart(4, '0')}`;
}

export function formatOverrideId(id: number): string {
  return `OVR-${String(id).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Departments ('Engineering' | 'Traction' | 'S&T')
// ---------------------------------------------------------------------------

export function formatDepartment(dept: Department): string {
  switch (dept) {
    case 'Engineering':
      return 'Engineering (Track & Civil)';
    case 'Traction':
      return 'Traction (OHE & Power)';
    case 'S&T':
      return 'Signal & Telecom (S&T)';
    default: {
      const exhaustiveCheck: never = dept;
      return exhaustiveCheck;
    }
  }
}

export function getDepartmentShort(dept: Department): string {
  switch (dept) {
    case 'Engineering':
      return 'ENG';
    case 'Traction':
      return 'TRC';
    case 'S&T':
      return 'S&T';
    default:
      return dept;
  }
}

export function getDepartmentColor(dept: Department): string {
  switch (dept) {
    case 'Engineering':
      return '#2563eb'; // Blue
    case 'Traction':
      return '#7c3aed'; // Purple
    case 'S&T':
      return '#0891b2'; // Cyan
    default:
      return '#4b5563';
  }
}

// ---------------------------------------------------------------------------
// Defect Severity ('A' | 'B' | 'C')
// ---------------------------------------------------------------------------

export function formatDefectSeverity(severity: DefectSeverity): string {
  switch (severity) {
    case 'A':
      return 'Class A (Critical / Immediate)';
    case 'B':
      return 'Class B (Major / Urgent)';
    case 'C':
      return 'Class C (Minor / Routine)';
    default: {
      const exhaustiveCheck: never = severity;
      return exhaustiveCheck;
    }
  }
}

export function getSeverityBadge(severity: DefectSeverity): BadgeStyle {
  switch (severity) {
    case 'A':
      return {
        label: 'Severity A',
        color: '#dc2626',
        bg: '#fef2f2',
        borderColor: '#fecaca',
      };
    case 'B':
      return {
        label: 'Severity B',
        color: '#ea580c',
        bg: '#fff7ed',
        borderColor: '#fed7aa',
      };
    case 'C':
      return {
        label: 'Severity C',
        color: '#16a34a',
        bg: '#f0fdf4',
        borderColor: '#bbf7d0',
      };
    default:
      return {
        label: severity,
        color: '#6b7280',
        bg: '#f3f4f6',
      };
  }
}

// ---------------------------------------------------------------------------
// Criticality Score & Levels (0 - 100)
// ---------------------------------------------------------------------------

export function getCriticalityLevel(score: number | null): CriticalityLevel {
  if (score === null || score === undefined) return 'Unscored';
  if (score >= 90) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

export function getCriticalityBadge(score: number | null): BadgeStyle {
  const level = getCriticalityLevel(score);
  switch (level) {
    case 'Critical':
      return {
        label: 'Critical',
        color: '#dc2626',
        bg: '#fef2f2',
        borderColor: '#fecaca',
      };
    case 'High':
      return {
        label: 'High',
        color: '#ea580c',
        bg: '#fff7ed',
        borderColor: '#fed7aa',
      };
    case 'Medium':
      return {
        label: 'Medium',
        color: '#d97706',
        bg: '#fffbeb',
        borderColor: '#fde68a',
      };
    case 'Low':
      return {
        label: 'Low',
        color: '#16a34a',
        bg: '#f0fdf4',
        borderColor: '#bbf7d0',
      };
    case 'Unscored':
      return {
        label: 'Unscored',
        color: '#6b7280',
        bg: '#f3f4f6',
        borderColor: '#e5e7eb',
      };
  }
}

export function formatCriticalityScore(score: number | null): string {
  if (score === null || score === undefined) return '—';
  return score.toFixed(1);
}

// ---------------------------------------------------------------------------
// Task Status ('open' | 'scheduled' | 'unscheduled' | 'completed' | 'cancelled')
// ---------------------------------------------------------------------------

export function formatTaskStatus(status: TaskStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'scheduled':
      return 'Scheduled';
    case 'unscheduled':
      return 'Unscheduled';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

// ---------------------------------------------------------------------------
// Plan Status ('pending' | 'generating' | 'ready' | 'failed' | 'superseded')
// ---------------------------------------------------------------------------

export function formatPlanStatus(status: PlanStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending (Queued)';
    case 'generating':
      return 'Generating (Optimizing)';
    case 'ready':
      return 'Ready (Available)';
    case 'failed':
      return 'Failed';
    case 'superseded':
      return 'Superseded';
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

// ---------------------------------------------------------------------------
// Assignment Status ('scheduled' | 'unscheduled' | 'overridden')
// ---------------------------------------------------------------------------

export function formatAssignmentStatus(status: AssignmentStatus): string {
  switch (status) {
    case 'scheduled':
      return 'AI Scheduled';
    case 'unscheduled':
      return 'Unscheduled';
    case 'overridden':
      return 'Planner Overridden';
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

// ---------------------------------------------------------------------------
// Override Action ('reassign' | 'force_schedule' | 'unschedule')
// ---------------------------------------------------------------------------

export function formatOverrideAction(action: OverrideAction): string {
  switch (action) {
    case 'reassign':
      return 'Reassign Window';
    case 'force_schedule':
      return 'Force Schedule';
    case 'unschedule':
      return 'Remove / Unschedule';
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}

// ---------------------------------------------------------------------------
// Horizon Type ('daily' | 'weekly' | 'monthly')
// ---------------------------------------------------------------------------

export function formatHorizonType(horizonType: PlanningHorizonType | string | null): string {
  if (!horizonType) return '—';
  switch (horizonType) {
    case 'daily':
      return 'Daily Horizon (24h)';
    case 'weekly':
      return 'Weekly Horizon (7 Days)';
    case 'monthly':
      return 'Monthly Horizon (30 Days)';
    default:
      return String(horizonType);
  }
}

export function formatWeekday(day: Weekday | null): string {
  if (!day) return '—';
  switch (day) {
    case 'Mon':
      return 'Monday';
    case 'Tue':
      return 'Tuesday';
    case 'Wed':
      return 'Wednesday';
    case 'Thu':
      return 'Thursday';
    case 'Fri':
      return 'Friday';
    case 'Sat':
      return 'Saturday';
    case 'Sun':
      return 'Sunday';
    default:
      return day;
  }
}

// ---------------------------------------------------------------------------
// Durations and Dates
// ---------------------------------------------------------------------------

export function formatDuration(hours: number): string {
  if (hours <= 0) return '0m';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function parseIsoDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatIsoDate(dateString: string | null | undefined): string {
  const d = parseIsoDate(dateString);
  if (!d) return '—';
  return d.toISOString().split('T')[0];
}

export function formatIsoDateTime(dateString: string | null | undefined): string {
  const d = parseIsoDate(dateString);
  if (!d) return '—';
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}
