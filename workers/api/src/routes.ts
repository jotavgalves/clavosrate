import { json } from './http';

export const ROUTES = {
  public: [
    'GET /health',
    'GET /api/v1',
    'POST /api/v1/auth/register-merchant',
    'POST /api/v1/auth/login'
  ],
  authenticated: [
    'GET /api/v1/auth/me',
    'POST /api/v1/auth/logout'
  ],
  merchant: [
    'GET /api/v1/merchant/dashboard',
    'POST /api/v1/persons/search',
    'POST /api/v1/persons',
    'GET /api/v1/loans',
    'POST /api/v1/loans',
    'POST /api/v1/loans/:id/payments'
  ],
  admin: [
    'GET /api/v1/admin/dashboard',
    'GET /api/v1/admin/organizations',
    'GET /api/v1/admin/users',
    'GET /api/v1/admin/loans',
    'GET /api/v1/admin/documents',
    'GET /api/v1/admin/disputes',
    'GET /api/v1/admin/audit'
  ],
  pending: [
    'POST /api/v1/documents/upload-session',
    'POST /api/v1/admin/documents/:id/review',
    'GET /api/v1/admin/risk-cases'
  ]
} as const;

export function routeCatalog(requestId: string): Response {
  return json({
    name: 'Clavos Brasil API',
    version: 'v1',
    status: 'authenticated-domain-foundation',
    routes: ROUTES,
    note: 'Las rutas merchant y admin activas exigen sesión válida y permisos RBAC. Los documentos sensibles y acciones administrativas de escritura continúan cerrados.'
  }, requestId);
}
