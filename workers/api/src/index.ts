import { apiError, json, requestId, withCors } from './http';
import { protectedStub, routeCatalog } from './routes';

export interface Env {
  DB: D1Database;
  PRIVATE_DOCUMENTS: R2Bucket;
  JOBS: Queue;
  APP_ENV: string;
}

function isProtectedV1(pathname: string): boolean {
  return pathname.startsWith('/api/v1/admin/') ||
    pathname.startsWith('/api/v1/merchant/') ||
    pathname.startsWith('/api/v1/persons') ||
    pathname.startsWith('/api/v1/loans') ||
    pathname.startsWith('/api/v1/documents');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = requestId(request);
    const origin = request.headers.get('origin');

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), origin, env.APP_ENV);
    }

    let response: Response;

    if (request.method === 'GET' && url.pathname === '/health') {
      response = json({
        service: 'clavos-api',
        environment: env.APP_ENV,
        status: 'ok',
        timestamp: new Date().toISOString(),
        request_id: id
      }, id);
      return withCors(response, origin, env.APP_ENV);
    }

    if (request.method === 'GET' && url.pathname === '/api/v1') {
      return withCors(routeCatalog(id), origin, env.APP_ENV);
    }

    // Security boundary: no protected domain route becomes usable by accident.
    // Authentication + RBAC middleware will replace this stub in the next phase.
    if (isProtectedV1(url.pathname)) {
      return withCors(protectedStub(id), origin, env.APP_ENV);
    }

    response = apiError(id, 404, 'NOT_FOUND', 'Ruta no encontrada');
    return withCors(response, origin, env.APP_ENV);
  }
} satisfies ExportedHandler<Env>;
