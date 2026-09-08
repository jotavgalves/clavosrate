import { apiError, json, requestId, withCors } from './http';
import { routeCatalog } from './routes';
import { login, logout, me, registerMerchant } from './handlers-auth';
import { createLoan, createPayment, listLoans, merchantDashboard } from './handlers-merchant';
import { createPerson, searchPerson } from './handlers-persons';

export interface Env {
  DB: D1Database;
  PRIVATE_DOCUMENTS: R2Bucket;
  JOBS: Queue;
  APP_ENV: string;
  CPF_HMAC_SECRET: string;
  CPF_ENCRYPTION_KEY_B64: string;
}

function paymentRoute(pathname: string): string | null {
  const match = pathname.match(/^\/api\/v1\/loans\/([^/]+)\/payments$/);
  return match?.[1] || null;
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/api/v1/admin/');
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

    try {
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

      if (request.method === 'POST' && url.pathname === '/api/v1/auth/register-merchant') {
        response = await registerMerchant(request, env, id);
      } else if (request.method === 'POST' && url.pathname === '/api/v1/auth/login') {
        response = await login(request, env, id);
      } else if (request.method === 'POST' && url.pathname === '/api/v1/auth/logout') {
        response = await logout(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/auth/me') {
        response = await me(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/merchant/dashboard') {
        response = await merchantDashboard(request, env, id);
      } else if (request.method === 'POST' && url.pathname === '/api/v1/persons/search') {
        response = await searchPerson(request, env, id);
      } else if (request.method === 'POST' && url.pathname === '/api/v1/persons') {
        response = await createPerson(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/loans') {
        response = await listLoans(request, env, id);
      } else if (request.method === 'POST' && url.pathname === '/api/v1/loans') {
        response = await createLoan(request, env, id);
      } else {
        const loanId = request.method === 'POST' ? paymentRoute(url.pathname) : null;
        if (loanId) {
          response = await createPayment(request, env, id, loanId);
        } else if (isAdminPath(url.pathname)) {
          response = apiError(id, 501, 'ADMIN_API_PENDING', 'La API administrativa continúa bloqueada hasta completar sus handlers con RBAC y auditoría.');
        } else {
          response = apiError(id, 404, 'NOT_FOUND', 'Ruta no encontrada');
        }
      }
    } catch (error) {
      console.error('request_failed', { request_id: id, error });
      response = apiError(id, 500, 'INTERNAL_ERROR', 'No fue posible completar la solicitud.');
    }

    return withCors(response, origin, env.APP_ENV);
  }
} satisfies ExportedHandler<Env>;
