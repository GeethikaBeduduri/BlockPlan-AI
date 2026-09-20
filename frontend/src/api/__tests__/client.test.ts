/**
 * Unit tests for the centralized API client (client.ts).
 *
 * Tests cover:
 *   - Axios instance base URL and default headers
 *   - Successful 2xx responses are passed through unchanged
 *   - Backend ErrorResponse bodies (4xx/5xx) are converted to ApiError
 *   - HTTP errors without a structured body are converted to ApiError
 *   - Network/timeout errors (no response) are converted to ApiError
 *   - Non-Axios errors are re-thrown unchanged
 *
 * All HTTP behavior is mocked via axios-mock-adapter — no real network calls.
 */

import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError, apiClient } from '../client';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

describe('apiClient instance', () => {
  it('uses VITE_API_BASE_URL as base URL (defaults to http://127.0.0.1:8000 in test env)', () => {
    // In the vitest jsdom environment import.meta.env.VITE_API_BASE_URL is undefined,
    // so the client falls back to the hard-coded default.
    expect(apiClient.defaults.baseURL).toBe('http://127.0.0.1:8000');
  });

  it('sends Content-Type: application/json by default', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('sends Accept: application/json by default', () => {
    expect(apiClient.defaults.headers['Accept']).toBe('application/json');
  });
});

describe('successful responses', () => {
  it('returns response data for a 200 response', async () => {
    mock.onGet('/tasks').reply(200, { items: [], meta: { limit: 50, offset: 0, total: 0 } });
    const res = await apiClient.get('/tasks');
    expect(res.data).toEqual({ items: [], meta: { limit: 50, offset: 0, total: 0 } });
  });

  it('returns response data for a 202 Accepted response', async () => {
    const jobResponse = { accepted: true, job_id: 'abc-123', plan_id: 1, horizon_type: 'daily', status: 'pending' };
    mock.onPost('/generate-plan').reply(202, jobResponse);
    const res = await apiClient.post('/generate-plan', {});
    expect(res.data).toEqual(jobResponse);
  });
});

describe('error handling — structured backend ErrorResponse body', () => {
  it('throws ApiError with correct code and message for a 404 with ErrorResponse body', async () => {
    mock.onGet('/tasks/999').reply(404, {
      error: 'not_found',
      message: 'Task not found',
      details: null,
    });

    await expect(apiClient.get('/tasks/999')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'not_found',
      message: 'Task not found',
      status: 404,
      details: null,
    });
  });

  it('throws ApiError with details for a 422 validation error', async () => {
    const errorBody = {
      error: 'validation_error',
      message: 'Request validation failed',
      details: [{ field: 'horizon_end', message: 'horizon_end must be on or after horizon_start' }],
    };
    mock.onPost('/generate-plan').reply(422, errorBody);

    await expect(apiClient.post('/generate-plan', {})).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
      details: [{ field: 'horizon_end', message: 'horizon_end must be on or after horizon_start' }],
    });
  });

  it('throws ApiError for a 503 dependency_not_ready response', async () => {
    mock.onGet('/kpis/availability').reply(503, {
      error: 'dependency_not_ready',
      message: 'Persistence layer not ready',
      details: null,
    });

    await expect(apiClient.get('/kpis/availability')).rejects.toMatchObject({
      code: 'dependency_not_ready',
      status: 503,
    });
  });

  it('throws ApiError for a 409 conflict', async () => {
    mock.onPut('/plan/1/override').reply(409, {
      error: 'conflict',
      message: 'Plan has already been superseded',
      details: null,
    });

    await expect(apiClient.put('/plan/1/override', {})).rejects.toMatchObject({
      code: 'conflict',
      status: 409,
    });
  });
});

describe('error handling — HTTP errors without structured body', () => {
  it('throws ApiError with code "http_error" for a 500 with no ErrorResponse body', async () => {
    mock.onGet('/tasks').reply(500, 'Internal Server Error');

    await expect(apiClient.get('/tasks')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'http_error',
      status: 500,
    });
  });

  it('throws ApiError with code "http_error" for a 401 with no body', async () => {
    mock.onGet('/plan/1').reply(401);

    await expect(apiClient.get('/plan/1')).rejects.toMatchObject({
      code: 'http_error',
      status: 401,
    });
  });
});

describe('error handling — network errors', () => {
  it('throws ApiError with code "network_error" when the network is unavailable', async () => {
    mock.onGet('/tasks').networkError();

    await expect(apiClient.get('/tasks')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'network_error',
      status: undefined,
    });
  });

  it('throws ApiError with code "network_error" for a timeout', async () => {
    mock.onGet('/tasks').timeout();

    await expect(apiClient.get('/tasks')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'network_error',
    });
  });
});

describe('ApiError class', () => {
  it('is instanceof Error', () => {
    const err = new ApiError('not_found', 'Not found', 404);
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "ApiError"', () => {
    const err = new ApiError('not_found', 'Not found', 404);
    expect(err.name).toBe('ApiError');
  });

  it('stores code, status, and details', () => {
    const details = [{ field: 'plan_id', message: 'must be > 0' }];
    const err = new ApiError('validation_error', 'Invalid', 422, details);
    expect(err.code).toBe('validation_error');
    expect(err.status).toBe(422);
    expect(err.details).toEqual(details);
  });

  it('defaults details to null', () => {
    const err = new ApiError('not_found', 'Not found', 404);
    expect(err.details).toBeNull();
  });

  it('status is undefined for network errors', () => {
    const err = new ApiError('network_error', 'No response');
    expect(err.status).toBeUndefined();
  });
});
