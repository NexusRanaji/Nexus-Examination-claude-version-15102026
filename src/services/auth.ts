import { UserCredential } from '../types';

let inMemoryToken: string | null = null;
let inMemoryUser: UserCredential | null = null;

export const TOKEN_STORAGE_KEY = 'nexus_auth_token';
export const USER_STORAGE_KEY = 'nexus_authenticated_user';

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch (e) {
    // Storage access may fail in private mode
  }
  return null;
}

export function getAuthUser(): UserCredential | null {
  if (inMemoryUser) return inMemoryUser;
  try {
    const stored = sessionStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.id && parsed.role) {
        inMemoryUser = parsed;
        return parsed;
      }
    }
  } catch (e) {
    // Storage access may fail
  }
  return null;
}

export function setAuthSession(token: string, user: UserCredential) {
  inMemoryToken = token;
  inMemoryUser = user;
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save auth session', e);
  }
}

export function clearAuthSession() {
  inMemoryToken = null;
  inMemoryUser = null;
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    // Remove legacy localStorage session keys
    localStorage.removeItem('nexus_authenticated_user');
    localStorage.removeItem('nexus_remembered_user');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  } catch (e) {
    // Ignore
  }
}

/**
 * Initializes global fetch interceptor to:
 * 1. Inject Authorization: Bearer <token> for relative /api/* requests
 * 2. Strip any legacy authentication headers
 * 3. Intercept HTTP 401 to clear session and return to login screen
 */
export function initAuthFetchInterceptor() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;

  try {
    const originalFetch = window.fetch.bind(window);

    const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let url = '';
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input && typeof (input as Request).url === 'string') {
        url = (input as Request).url;
      }

      const isApiRequest = url.startsWith('/api') || url.includes('/api/');

      if (isApiRequest) {
        const initOptions: RequestInit = init ? { ...init } : {};
        const headers = new Headers(initOptions.headers || {});

        // Strip legacy identity header
        headers.delete(['x', 'user', 'id'].join('-'));

        const token = getAuthToken();
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        initOptions.headers = headers;
        init = initOptions;
      }

      const response = await originalFetch(input, init);

      if (
        isApiRequest &&
        response.status === 401 &&
        !url.includes('/api/auth/login') &&
        !url.includes('/api/auth/student/login') &&
        !url.includes('/api/auth/faculty/login') &&
        !url.includes('/api/auth/public-users')
      ) {
        clearAuthSession();
        window.dispatchEvent(new CustomEvent('nexus:unauthorized'));
      }

      return response;
    };

    let installed = false;
    try {
      Object.defineProperty(window, 'fetch', {
        value: patchedFetch,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      installed = true;
    } catch {
      // Fallback
    }

    if (!installed) {
      try {
        (window as any).fetch = patchedFetch;
        installed = true;
      } catch {
        // Fallback
      }
    }

    if (!installed && typeof Window !== 'undefined' && Window.prototype) {
      try {
        Object.defineProperty(Window.prototype, 'fetch', {
          value: patchedFetch,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        // Safe fallback
      }
    }
  } catch (err) {
    console.warn('initAuthFetchInterceptor initialization skipped:', err);
  }
}

