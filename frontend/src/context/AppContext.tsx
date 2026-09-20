import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type MaintenanceTask, mockTasks } from '../data/mockTasks';
import { type Block, mockBlocks, type Corridor, mockCorridors, type Train, mockTrains } from '../data/mockBlocks';
import type { BlockPlanViewModel } from '../adapters/types';
import { getPlan } from '../api/endpoints/plans';
import { adaptBlockPlan } from '../adapters/planAdapter';

export interface PlanResult {
  generated: boolean;
  timestamp: string;
  totalTasks: number;
  scheduledTasks: number;
  criticalScheduled: number;
  totalCritical: number;
  blockUtilization: number;
  assetAvailability: number;
  conflicts: number;
  assignments: BlockAssignment[];
}

export interface BlockAssignment {
  block_id: string;
  corridor_id: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  tasks: AssignedTask[];
  total_duration: number;
  utilization: number;
  is_shared: boolean;
  departments: string[];
}

export interface AssignedTask {
  task_id: string;
  department: string;
  duration_min: number;
  criticality_score: number;
  start_offset: number;
  status: 'approved' | 'pending' | 'overridden' | 'locked';
  override_reason?: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  task_id?: string;
  details: string;
  actor: 'AI' | 'Planner';
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface AppState {
  tasks: MaintenanceTask[];
  blocks: Block[];
  corridors: Corridor[];
  trains: Train[];
  currentPlan: BlockPlanViewModel | null;
  planResult: PlanResult | null;
  demoMode: boolean;
  auditLog: AuditEntry[];
  toasts: Toast[];
  selectedTask: MaintenanceTask | null;
  sidebarOpen: boolean;
}

interface AppContextType extends AppState {
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setCurrentPlan: (plan: BlockPlanViewModel | null) => void;
  /**
   * Re-fetch GET /plan/{planId} from the backend and update currentPlan.
   * Called after a successful override to keep frontend state consistent.
   */
  refetchPlan: (planId: number) => Promise<void>;
  toggleDemoMode: () => void;
  setSelectedTask: (task: MaintenanceTask | null) => void;
  /** Local-only UI approval — no backend endpoint exists for approval. */
  approveTask: (taskId: string) => void;
  /** Local-only UI lock — no backend endpoint exists for locking. */
  lockTask: (taskId: string) => void;
  addToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};

function adaptViewModelToPlanResult(plan: BlockPlanViewModel): PlanResult {
  const kpis = plan.kpis;
  const windowMap = new Map<number, typeof plan.assignments>();
  for (const a of plan.scheduledAssignments) {
    if (a.windowId !== null) {
      const list = windowMap.get(a.windowId) ?? [];
      list.push(a);
      windowMap.set(a.windowId, list);
    }
  }

  const assignments: BlockAssignment[] = [];
  for (const [windowId, items] of windowMap.entries()) {
    const first = items[0]!;
    const totalDuration = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const durationMin = Math.max(240, totalDuration);
    const depts = Array.from(new Set(items.map(i => i.departmentDisplay)));

    let offset = 0;
    const tasks: AssignedTask[] = items.map(i => {
      const taskObj: AssignedTask = {
        task_id: i.formattedTaskId,
        department: i.departmentDisplay,
        duration_min: i.estimatedMinutes,
        criticality_score: i.criticalityScore,
        start_offset: offset,
        status: i.isOverridden ? 'overridden' : 'pending',
      };
      offset += i.estimatedMinutes;
      return taskObj;
    });

    const util = durationMin > 0 ? (totalDuration / durationMin) * 100 : 0;
    assignments.push({
      block_id: `WIN-${String(windowId).padStart(4, '0')}`,
      corridor_id: first.corridorId,
      start_time: '08:00',
      end_time: '12:00',
      duration_min: durationMin,
      tasks,
      total_duration: totalDuration,
      utilization: Number(util.toFixed(1)),
      is_shared: depts.length > 1,
      departments: depts,
    });
  }

  return {
    generated: plan.isReady,
    timestamp: plan.generatedAtFormatted || new Date().toLocaleTimeString(),
    totalTasks: plan.totalTasksCount,
    scheduledTasks: plan.scheduledTasksCount,
    criticalScheduled: plan.scheduledAssignments.filter(a => a.defectSeverity === 'A').length,
    totalCritical: plan.assignments.filter(a => a.defectSeverity === 'A').length,
    blockUtilization: kpis?.blockUtilizationPercent ?? (assignments.length > 0 ? assignments.reduce((s, a) => s + a.utilization, 0) / assignments.length : 0),
    assetAvailability: kpis?.assetAvailabilityPercent ?? 90.0,
    conflicts: 0,
    assignments,
  };
}


export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tasks] = useState<MaintenanceTask[]>(mockTasks);
  const [blocks] = useState<Block[]>(mockBlocks);
  const [corridors] = useState<Corridor[]>(mockCorridors);
  const [trains] = useState<Train[]>(mockTrains);
  const [currentPlan, setCurrentPlanState] = useState<BlockPlanViewModel | null>(null);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const setCurrentPlan = useCallback((plan: BlockPlanViewModel | null) => {
    setCurrentPlanState(plan);
    if (plan) {
      setPlanResult(adaptViewModelToPlanResult(plan));
    } else {
      setPlanResult(null);
    }
  }, []);

  /**
   * Re-fetch a plan from the backend and update currentPlan + planResult.
   * Called after a successful PUT /plan/{plan_id}/override.
   */
  const refetchPlan = useCallback(async (planId: number): Promise<void> => {
    try {
      const dto = await getPlan(planId);
      const vm = adaptBlockPlan(dto);
      setCurrentPlan(vm);
    } catch {
      // Silently ignore refetch failures — the override already succeeded.
      // The user can refresh the page or generate a new plan if needed.
    }
  }, [setCurrentPlan]);

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);


  const toggleDemoMode = useCallback(() => {
    setDemoMode(prev => {
      const next = !prev;
      if (next) {
        addToast('Demo mode activated — Scenario C05 loaded', 'info');
      } else {
        addToast('Demo mode deactivated', 'info');
      }
      return next;
    });
  }, [addToast]);

  const approveTask = useCallback((taskId: string) => {
    if (!planResult) return;
    setPlanResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map(a => ({
          ...a,
          tasks: a.tasks.map(t => t.task_id === taskId ? { ...t, status: 'approved' as const } : t),
        })),
      };
    });
    setAuditLog(prev => [{
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'Task Approved',
      task_id: taskId,
      details: `Planner approved AI assignment for ${taskId}.`,
      actor: 'Planner',
    }, ...prev]);
    addToast(`${taskId} approved`, 'success');
  }, [planResult, addToast]);


  const lockTask = useCallback((taskId: string) => {
    if (!planResult) return;
    setPlanResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map(a => ({
          ...a,
          tasks: a.tasks.map(t => t.task_id === taskId ? { ...t, status: 'locked' as const } : t),
        })),
      };
    });
    setAuditLog(prev => [{
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'Task Locked',
      task_id: taskId,
      details: `Planner locked assignment for ${taskId}. Cannot be modified by optimizer.`,
      actor: 'Planner',
    }, ...prev]);
    addToast(`${taskId} locked`, 'info');
  }, [planResult, addToast]);

  return (
    <AppContext.Provider value={{
      tasks, blocks, corridors, trains,
      currentPlan, setCurrentPlan, refetchPlan,
      planResult,
      demoMode, auditLog, toasts, selectedTask,
      sidebarOpen, setSidebarOpen, toggleSidebar, closeSidebar,
      toggleDemoMode, setSelectedTask,
      approveTask, lockTask,
      addToast, removeToast,
    }}>
      {children}
    </AppContext.Provider>
  );
};
