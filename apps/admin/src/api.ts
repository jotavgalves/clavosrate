const API_BASE = ((import.meta as any).env?.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || 'http://127.0.0.1:8787';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload?.code || 'REQUEST_FAILED', payload?.error || 'No fue posible completar la solicitud.', payload?.request_id);
  return payload as T;
}

export const adminApi = {
  login: (email: string, password: string) => request<any>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<any>('/api/v1/auth/me'),
  logout: () => request<any>('/api/v1/auth/logout', { method: 'POST' }),
  dashboard: () => request<any>('/api/v1/admin/dashboard'),
  organizations: () => request<any>('/api/v1/admin/organizations'),
  users: () => request<any>('/api/v1/admin/users'),
  loans: () => request<any>('/api/v1/admin/loans'),
  documents: () => request<any>('/api/v1/admin/documents'),
  disputes: () => request<any>('/api/v1/admin/disputes'),
  audit: () => request<any>('/api/v1/admin/audit'),
  reviewDocument: (id: string, body: Record<string, unknown>) => request<any>(`/api/v1/admin/documents/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify(body) }),
  documentContentUrl: (id: string) => `${API_BASE}/api/v1/admin/documents/${encodeURIComponent(id)}/content`
};

export { API_BASE };
