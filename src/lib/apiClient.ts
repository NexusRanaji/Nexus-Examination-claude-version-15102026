import { getAuthToken, clearAuthSession } from '../services/auth';

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, any>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
  idempotencyKey?: string;
  skipAuth?: boolean;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  ok: boolean;
  headers: Headers;
  requestId?: string;
}

export class ApiError extends Error {
  status: number;
  data: any;
  requestId?: string;

  constructor(message: string, status: number, data?: any, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.requestId = requestId;
  }
}

const DEFAULT_TIMEOUT_MS = 20000; // 20 seconds
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(endpoint: string, params?: Record<string, any>): string {
  let normalized = endpoint;
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    if (!normalized.startsWith('/api') && !normalized.startsWith('/')) {
      normalized = `/api/${normalized}`;
    } else if (normalized.startsWith('/') && !normalized.startsWith('/api')) {
      normalized = `/api${normalized}`;
    }
    normalized = `${BASE_URL}${normalized}`;
  }

  if (params && Object.keys(params).length > 0) {
    const urlObj = new URL(normalized, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        urlObj.searchParams.set(k, String(v));
      }
    }
    return urlObj.toString();
  }
  return normalized;
}

async function executeRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const method = (options.method || 'GET').toUpperCase();
  const url = buildUrl(endpoint, options.params);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Retry logic rules:
  // - GET: up to 2 retries (3 total attempts) with exponential backoff
  // - POST / PUT / DELETE: 0 retries UNLESS options.idempotencyKey is set
  const maxRetries = options.retries !== undefined
    ? options.retries
    : method === 'GET'
    ? 2
    : options.idempotencyKey
    ? 2
    : 0;

  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(options.headers || {});

      // Add auth token if not skipped
      if (!options.skipAuth) {
        const token = getAuthToken();
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }

      // Add idempotency key if specified
      if (options.idempotencyKey && !headers.has('Idempotency-Key')) {
        headers.set('Idempotency-Key', options.idempotencyKey);
      }

      // Prepare body
      let body = options.body;
      if (body !== undefined && body !== null) {
        if (!(body instanceof FormData) && !(body instanceof Blob) && typeof body !== 'string') {
          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }
          body = JSON.stringify(body);
        }
      }

      const fetchOptions: RequestInit = {
        ...options,
        method,
        headers,
        body,
        signal: controller.signal,
      };

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const requestId = response.headers.get('x-request-id') || undefined;

      // Handle 401 Unauthorized
      if (
        response.status === 401 &&
        !options.skipAuth &&
        !url.includes('/api/auth/login') &&
        !url.includes('/api/auth/student/login') &&
        !url.includes('/api/auth/faculty/login') &&
        !url.includes('/api/auth/public-users')
      ) {
        clearAuthSession();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nexus:unauthorized'));
        }
      }

      // Parse JSON response safely
      let parsedData: any = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        parsedData = await response.json().catch(() => null);
      } else {
        const text = await response.text().catch(() => '');
        try {
          parsedData = JSON.parse(text);
        } catch {
          parsedData = text;
        }
      }

      if (!response.ok) {
        const errorMessage =
          (parsedData && typeof parsedData === 'object' && (parsedData.error || parsedData.message)) ||
          `Request failed with status ${response.status}`;

        const apiErr = new ApiError(errorMessage, response.status, parsedData, requestId);

        // Only retry server errors (5xx) or transient statuses for idempotent requests
        const isServerFault = response.status >= 500 && response.status <= 599;
        const canRetry = (method === 'GET' || !!options.idempotencyKey) && isServerFault;

        if (canRetry && attempt < maxRetries) {
          attempt++;
          const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          await sleep(backoff);
          continue;
        }

        throw apiErr;
      }

      return {
        data: parsedData,
        status: response.status,
        ok: true,
        headers: response.headers,
        requestId,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      // Check if it's an abort error (timeout)
      const isTimeout = err?.name === 'AbortError';
      const isNetworkError = err instanceof TypeError || isTimeout;
      const canRetry = (method === 'GET' || !!options.idempotencyKey) && isNetworkError;

      if (canRetry && attempt < maxRetries) {
        attempt++;
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        await sleep(backoff);
        continue;
      }

      if (err instanceof ApiError) {
        throw err;
      }

      const message = isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : err?.message || 'Network request failed';

      throw new ApiError(message, 0, null);
    }
  }

  throw lastError || new ApiError('Request failed after retries', 0, null);
}

export const apiClient = {
  get<T = any>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return executeRequest<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return executeRequest<T>(endpoint, { ...options, method: 'POST', body });
  },

  put<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return executeRequest<T>(endpoint, { ...options, method: 'PUT', body });
  },

  delete<T = any>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return executeRequest<T>(endpoint, { ...options, method: 'DELETE' });
  },

  request<T = any>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return executeRequest<T>(endpoint, options);
  },
};

export default apiClient;
