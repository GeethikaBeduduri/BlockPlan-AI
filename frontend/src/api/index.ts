/**
 * Public API for the entire api module.
 *
 * Usage:
 *   import { getTasks, ApiError, apiClient } from '@/api';
 *   import type { MaintenanceTaskResponse } from '@/api';
 */

// HTTP client and error class
export { apiClient, ApiError } from './client';

// All typed API functions
export * from './endpoints';

// All TypeScript types and interfaces
export type * from './types';
