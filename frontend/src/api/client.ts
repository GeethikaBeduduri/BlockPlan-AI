/**
 * Centralized Axios HTTP client for the SIH26027 Block Planning API.
 *
 * ALL network calls from the frontend must go through this client.
 * Components must NEVER construct their own axios instances or
 * hard-code the base URL.
 *
 * Configuration is read exclusively from Vite environment variables:
 *   VITE_API_BASE_URL  – FastAPI server base URL (no trailing slash)
 *   VITE_API_TIMEOUT_MS – request timeout in milliseconds (default 15 000)
 *
 * Error handling contract:
 *   - 4xx/5xx responses that carry a backend ErrorResponse body are surfaced
 *     as ApiError instances so callers can inspect error.code / error.message.
 *   - Network timeouts and connectivity failures are surfaced as ApiError
 *     with code "network_error".
 *   - All other unexpected errors are re-thrown as-is.
 */

import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';

import type { ErrorResponse, FieldError } from './types';

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const rawBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:8000');

const BASE_URL: string = rawBaseUrl.replace(/\/+$/, '');
const TIMEOUT_MS: number = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15_000);

// ---------------------------------------------------------------------------
// Typed application error
// ---------------------------------------------------------------------------

/**
 * Structured error thrown by all API functions.
 * Callers should catch ApiError and branch on `code` for user-facing messages.
 */
export class ApiError extends Error {
  /** Backend ErrorCode enum value, or "network_error" for connectivity issues. */
  readonly code: string;
  /** HTTP status code, undefined for pure network errors. */
  readonly status: number | undefined;
  /** Validation field errors from the backend (422 responses). */
  readonly details: FieldError[] | null;

  constructor(
    code: string,
    message: string,
    status?: number,
    details: FieldError[] | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Response interceptor — normalise all errors into ApiError
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  // Success path — pass through unchanged
  (response: AxiosResponse) => response,

  // Error path — convert to ApiError
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<ErrorResponse>;

      // Network timeout or no response received
      if (!axiosErr.response) {
        throw new ApiError(
          'network_error',
          axiosErr.message || 'Network error: no response from server',
        );
      }

      const { status, data } = axiosErr.response;

      // Backend returned a structured ErrorResponse body
      if (
        data &&
        typeof data === 'object' &&
        'error' in data &&
        'message' in data
      ) {
        const body = data as ErrorResponse;
        throw new ApiError(body.error, body.message, status, body.details ?? null);
      }

      // Backend returned an HTTP error without a structured body
      throw new ApiError(
        'http_error',
        `HTTP ${status}: ${axiosErr.message}`,
        status,
      );
    }

    // Non-Axios error — re-throw unchanged
    throw error;
  },
);
