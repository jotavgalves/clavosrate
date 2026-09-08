import { apiError, json } from './http';

export const ROUTES = {
  merchant: [
    'GET /api/v1/merchant/dashboard',
    'GET /api/v1/persons/search',
    'POST /api/v1/persons',
    'GET /api/v1/loans',
    'POST /api/v1/loans',
    'POST /api/v1/loans/:id/payments',
    'POST /api/v1/documents/upload-session'
  ],
  admin: [
    'GET /api/v1/admin/dashboard',
    'GET /api/v1/admin/organizations',
    'GET /api/v1/admin/users',
    'GET /api/v1/admin/loans',
    'GET /api/v1/admin/documents',
    'POST /api/v1/admin/documents/:id/review',
    'GET /api/v1/admin/risk-cases',
    'GET /api/v1/admin/disputes',
    'GET /api/v1/admin/audit'
  ]
} as const;

export function routeCatalog(requestId: string): Response {
  return json({
    name: 'Clavos Brasil API',
    version: 'v1',
    status: 'foundation',
    routes: ROUTES,
    note: 'Las rutas protegidas se habilitarán únicamente después de implementar autenticación, sesión y autorización RBAC en el Worker.'
  }, requestId);
}

export function protectedStub(requestId: string): Response {
  return apiError(requestId, 501, 'AUTH_REQUIRED_NOT_IMPLEMENTED', 'La ruta está reservada, pero permanece bloqueada hasta completar autenticación y autorización.');
}
