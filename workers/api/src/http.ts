export type ApiError = { error: string; code: string; request_id: string };

export function requestId(request: Request): string {
  return request.headers.get('cf-ray') || crypto.randomUUID();
}

export function json(data: unknown, requestIdValue: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-request-id', requestIdValue);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(requestIdValue: string, status: number, code: string, error: string): Response {
  return json({ error, code, request_id: requestIdValue } satisfies ApiError, requestIdValue, { status });
}

export function withCors(response: Response, origin: string | null, env: string): Response {
  const headers = new Headers(response.headers);
  if (env !== 'production' && origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.set('vary', 'Origin');
  }
  headers.set('access-control-allow-headers', 'content-type, authorization, x-request-id');
  headers.set('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
