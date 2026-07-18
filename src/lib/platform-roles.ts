// Central definition of platform-staff roles. Any user carrying one of these
// roles is SEZA platform staff, NOT a merchant user. Merchant and platform
// roles are mutually exclusive (enforced by DB trigger tg_enforce_role_exclusivity).
export const PLATFORM_ROLES = [
  "super_admin",
  "operations_admin",
  "support_admin",
  "billing_admin",
  "analyst",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function isPlatformRole(role: string | null | undefined): role is PlatformRole {
  return !!role && (PLATFORM_ROLES as readonly string[]).includes(role);
}

export function hasAnyPlatformRole(roles: readonly string[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.some(isPlatformRole);
}
