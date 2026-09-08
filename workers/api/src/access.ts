import { hasPermission, type Permission } from '../../../packages/permissions/src/index';
import { apiError } from './http';
import { getSessionPrincipal, type SessionPrincipal } from './auth';

export async function requirePermission(
  db: D1Database,
  request: Request,
  requestId: string,
  permission: Permission
): Promise<{ principal: SessionPrincipal } | { response: Response }> {
  const principal = await getSessionPrincipal(db, request);
  if (!principal) {
    return { response: apiError(requestId, 401, 'UNAUTHENTICATED', 'Debes iniciar sesión para continuar.') };
  }

  if (!hasPermission(principal.role, permission)) {
    return { response: apiError(requestId, 403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.') };
  }

  return { principal };
}

export function requireOrganization(principal: SessionPrincipal, requestId: string): Response | null {
  if (!principal.organizationId) {
    return apiError(requestId, 403, 'ORGANIZATION_REQUIRED', 'Selecciona una organización para continuar.');
  }
  return null;
}
