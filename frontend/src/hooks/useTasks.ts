/**
 * React Hook for Maintenance Tasks.
 *
 * Communicates with the frozen FastAPI backend via `getTasks` (`GET /tasks`)
 * and adapts DTOs into `TaskListViewModel` without client-side score fabrication.
 */

import { useCallback, useEffect, useState } from 'react';

import { adaptTaskList } from '../adapters';
import type { TaskListViewModel, TaskViewModel } from '../adapters/types';
import { getTasks } from '../api/endpoints/tasks';
import type { Department, TaskListParams, TaskStatus } from '../api/types';

export interface UseTasksOptions {
  initialLimit?: number;
  initialDepartment?: Department;
  initialCorridorId?: string;
  initialStatus?: TaskStatus;
}

export interface UseTasksResult {
  tasks: TaskViewModel[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
  corridorFilter: string;
  departmentFilter: Department | '';
  statusFilter: TaskStatus | '';
  setCorridorFilter: (corridor: string) => void;
  setDepartmentFilter: (dept: Department | '') => void;
  setStatusFilter: (status: TaskStatus | '') => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  refetch: () => Promise<void>;
}

export function useTasks(options: UseTasksOptions = {}): UseTasksResult {
  const [limit, setLimitState] = useState<number>(options.initialLimit ?? 50);
  const [page, setPageState] = useState<number>(1);
  const [corridorFilter, setCorridorFilterState] = useState<string>(
    options.initialCorridorId ?? '',
  );
  const [departmentFilter, setDepartmentFilterState] = useState<Department | ''>(
    options.initialDepartment ?? '',
  );
  const [statusFilter, setStatusFilterState] = useState<TaskStatus | ''>(
    options.initialStatus ?? '',
  );

  const [data, setData] = useState<TaskListViewModel>({
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
    page: 1,
    totalPages: 1,
    hasMore: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const offset = (page - 1) * limit;

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: TaskListParams = {
        limit,
        offset,
        ...(corridorFilter.trim() ? { corridor_id: corridorFilter.trim() } : {}),
        ...(departmentFilter ? { department: departmentFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      };

      const rawResponse = await getTasks(params);
      const adapted = adaptTaskList(rawResponse);
      setData(adapted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [limit, offset, corridorFilter, departmentFilter, statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const setCorridorFilter = useCallback((corridor: string) => {
    setCorridorFilterState(corridor);
    setPageState(1);
  }, []);

  const setDepartmentFilter = useCallback((dept: Department | '') => {
    setDepartmentFilterState(dept);
    setPageState(1);
  }, []);

  const setStatusFilter = useCallback((status: TaskStatus | '') => {
    setStatusFilterState(status);
    setPageState(1);
  }, []);

  const clearFilters = useCallback(() => {
    setCorridorFilterState('');
    setDepartmentFilterState('');
    setStatusFilterState('');
    setPageState(1);
  }, []);

  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
  }, []);

  const setLimit = useCallback((newLimit: number) => {
    setLimitState(newLimit);
    setPageState(1);
  }, []);

  return {
    tasks: data.items,
    total: data.total,
    limit,
    offset,
    page,
    totalPages: data.totalPages,
    hasMore: data.hasMore,
    loading,
    error,
    corridorFilter,
    departmentFilter,
    statusFilter,
    setCorridorFilter,
    setDepartmentFilter,
    setStatusFilter,
    clearFilters,
    setPage,
    setLimit,
    refetch: fetchTasks,
  };
}
