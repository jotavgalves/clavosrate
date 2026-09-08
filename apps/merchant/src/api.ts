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
      ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(init.headers || {})
    }
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new ApiError(response.status, payload?.code || 'REQUEST_FAILED', payload?.error || 'No fue posible completar la solicitud.', payload?.request_id);
  }
  return payload as T;
}

export const api = {
  login: (document_type: string, document_number: string, access_code: string) => request<any>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ document_type, document_number, access_code }) }),
  register: (body: Record<string, unknown>) => request<any>('/api/v1/auth/register-merchant', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<any>('/api/v1/auth/me'),
  logout: () => request<any>('/api/v1/auth/logout', { method: 'POST' }),
  dashboard: () => request<any>('/api/v1/merchant/dashboard'),
  loans: () => request<any>('/api/v1/loans'),
  searchPerson: (body: Record<string, unknown>) => request<any>('/api/v1/persons/search', { method: 'POST', body: JSON.stringify(body) }),
  createPerson: (body: Record<string, unknown>) => request<any>('/api/v1/persons', { method: 'POST', body: JSON.stringify(body) }),
  createLoan: (body: Record<string, unknown>) => request<any>('/api/v1/loans', { method: 'POST', body: JSON.stringify(body) }),
  recordPayment: (loanId: string, body: Record<string, unknown>) => request<any>(`/api/v1/loans/${encodeURIComponent(loanId)}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  uploadDocument: (form: FormData) => request<any>('/api/v1/documents', { method: 'POST', body: form })
};

export { API_BASE };
