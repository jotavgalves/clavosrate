import { apiError, json, requestId, withCors } from './http';
import { routeCatalog } from './routes';
import { login, logout, me, registerMerchant } from './handlers-auth';
import { createLoan, createPayment, listLoans, merchantDashboard } from './handlers-merchant';
import { createPerson, searchPerson } from './handlers-persons';
import {
  adminAudit,
  adminDashboard,
  adminDisputes,
  adminDocuments,
  adminLoans,
  adminOrganizations,
  adminUsers,
  adminRiskCases
} from './handlers-admin';
import { getAdminDocumentContent, reviewDocument, uploadDocument } from './handlers-documents';
import { processQueue } from './queue';

export interface Env {
  DB: D1Database;
  PRIVATE_DOCUMENTS: R2Bucket;
  JOBS: Queue;
  APP_ENV: string;
  CORS_ALLOWED_ORIGINS?: string;
  CPF_HMAC_SECRET: string;
  CPF_ENCRYPTION_KEY_B64: string;
}

function paymentRoute(pathname: string): string | null {
  const match = pathname.match(/^\/api\/v1\/loans\/([^/]+)\/payments$/);
  return match?.[1] || null;
}

function adminDocumentRoute(pathname: string, suffix: 'content' | 'review'): string | null {
  const match = pathname.match(new RegExp(`^/api/v1/admin/documents/([^/]+)/${suffix}$`));
  return match?.[1] || null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = requestId(request);
    const origin = request.headers.get('origin');
    const corsOrigins = env.CORS_ALLOWED_ORIGINS || '';

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), origin, env.APP_ENV, corsOrigins);
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
        return withCors(response, origin, env.APP_ENV, corsOrigins);
      }

      if (request.method === 'GET' && url.pathname === '/api/v1') {
        return withCors(routeCatalog(id), origin, env.APP_ENV, corsOrigins);
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
      } else if (request.method === 'POST' && url.pathname === '/api/v1/documents') {
        response = await uploadDocument(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/dashboard') {
        response = await adminDashboard(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/organizations') {
        response = await adminOrganizations(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/users') {
        response = await adminUsers(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/loans') {
        response = await adminLoans(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/documents') {
        response = await adminDocuments(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/disputes') {
        response = await adminDisputes(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/risk-cases') {
        response = await adminRiskCases(request, env, id);
      } else if (request.method === 'GET' && url.pathname === '/api/v1/admin/audit') {
        response = await adminAudit(request, env, id);
      } else {
        const loanId = request.method === 'POST' ? paymentRoute(url.pathname) : null;
        const documentContentId = request.method === 'GET' ? adminDocumentRoute(url.pathname, 'content') : null;
        const documentReviewId = request.method === 'POST' ? adminDocumentRoute(url.pathname, 'review') : null;

        if (loanId) {
          response = await createPayment(request, env, id, loanId);
        } else if (documentContentId) {
          response = await getAdminDocumentContent(request, env, id, documentContentId);
        } else if (documentReviewId) {
          response = await reviewDocument(request, env, id, documentReviewId);
        } else {
          response = apiError(id, 404, 'NOT_FOUND', 'Ruta no encontrada');
        }
      }
    } catch (error) {
      console.error('request_failed', { request_id: id, error });
      response = apiError(id, 500, 'INTERNAL_ERROR', 'No fue posible completar la solicitud.');
    }

    return withCors(response, origin, env.APP_ENV, corsOrigins);
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await processQueue(batch, env);
  }
} satisfies ExportedHandler<Env>;
