export const PERMISSIONS = [
  "merchant.dashboard.read",
  "merchant.person.search",
  "merchant.person.create",
  "merchant.loan.read",
  "merchant.loan.create",
  "merchant.payment.create",
  "merchant.document.upload",
  "merchant.team.manage",
  "admin.dashboard.read",
  "admin.user.read",
  "admin.user.suspend",
  "admin.organization.read",
  "admin.organization.update",
  "admin.person.read",
  "admin.loan.read",
  "admin.document.read",
  "admin.document.review",
  "admin.dispute.read",
  "admin.dispute.resolve",
  "admin.risk.read",
  "admin.risk.action",
  "admin.audit.read",
  "admin.settings.read",
  "admin.settings.write"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role =
  | "SUPERADMIN"
  | "PLATFORM_ADMIN"
  | "RISK_ANALYST"
  | "DOCUMENT_ANALYST"
  | "SUPPORT_AGENT"
  | "MERCHANT_OWNER"
  | "MERCHANT_MANAGER"
  | "COLLECTOR"
  | "VIEWER";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPERADMIN: PERMISSIONS,
  PLATFORM_ADMIN: PERMISSIONS.filter((p) => p !== "admin.settings.write"),
  RISK_ANALYST: ["admin.dashboard.read", "admin.user.read", "admin.organization.read", "admin.person.read", "admin.loan.read", "admin.risk.read", "admin.risk.action", "admin.audit.read"],
  DOCUMENT_ANALYST: ["admin.dashboard.read", "admin.person.read", "admin.document.read", "admin.document.review"],
  SUPPORT_AGENT: ["admin.dashboard.read", "admin.user.read", "admin.organization.read", "admin.person.read", "admin.loan.read"],
  MERCHANT_OWNER: ["merchant.dashboard.read", "merchant.person.search", "merchant.person.create", "merchant.loan.read", "merchant.loan.create", "merchant.payment.create", "merchant.document.upload", "merchant.team.manage"],
  MERCHANT_MANAGER: ["merchant.dashboard.read", "merchant.person.search", "merchant.person.create", "merchant.loan.read", "merchant.loan.create", "merchant.payment.create", "merchant.document.upload"],
  COLLECTOR: ["merchant.dashboard.read", "merchant.loan.read", "merchant.payment.create"],
  VIEWER: ["merchant.dashboard.read", "merchant.loan.read"]
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
