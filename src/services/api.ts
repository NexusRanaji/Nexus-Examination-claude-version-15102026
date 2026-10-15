import { apiClient, ApiError } from '../lib/apiClient';

export { apiClient, ApiError };

export const API = {
  async get(endpoint: string, options?: any) {
    try {
      const res = await apiClient.get(endpoint, options);
      return { data: res.data, status: res.status, ok: res.ok };
    } catch (err: any) {
      return { data: err.data || { error: err.message }, status: err.status || 500, ok: false };
    }
  },

  async post(endpoint: string, body: any, options?: any) {
    try {
      const res = await apiClient.post(endpoint, body, options);
      return { data: res.data, status: res.status, ok: res.ok };
    } catch (err: any) {
      return { data: err.data || { error: err.message }, status: err.status || 500, ok: false };
    }
  },

  async put(endpoint: string, body: any, options?: any) {
    try {
      const res = await apiClient.put(endpoint, body, options);
      return { data: res.data, status: res.status, ok: res.ok };
    } catch (err: any) {
      return { data: err.data || { error: err.message }, status: err.status || 500, ok: false };
    }
  },

  async delete(endpoint: string, options?: any) {
    try {
      const res = await apiClient.delete(endpoint, options);
      return { data: res.data, status: res.status, ok: res.ok };
    } catch (err: any) {
      return { data: err.data || { error: err.message }, status: err.status || 500, ok: false };
    }
  },
};

export default API;
