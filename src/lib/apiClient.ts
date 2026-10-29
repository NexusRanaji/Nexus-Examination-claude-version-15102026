import { getAuthToken } from '../services/auth';

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  skipAuth?: boolean;
  timeoutMs?: number;
  params?: Record<string, any>;
  idempotencyKey?: string;
  body?: any;
  [key: string]: any;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
}

async function request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers || {});

  if (options.idempotencyKey) {
    headers.set('idempotency-key', options.idempotencyKey);
  }

  let body = options.body;
  if (body !== undefined && typeof body !== 'string' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  } else if (!headers.has('Content-Type') && typeof body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  if (!options.skipAuth) {
    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let url = endpoint;
  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  let controller: AbortController | undefined;
  let timer: any;
  if (options.timeoutMs && options.timeoutMs > 0) {
    controller = new AbortController();
    timer = setTimeout(() => controller?.abort(), options.timeoutMs);
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      body,
      signal: controller ? controller.signal : options.signal,
    });

    if (timer) clearTimeout(timer);

    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      headers: res.headers,
    };
  } catch (err: any) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

export const apiClient = {
  request: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, options),

  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? body : options?.body,
    }),

  put: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? body : options?.body,
    }),

  patch: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? body : options?.body,
    }),

  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
