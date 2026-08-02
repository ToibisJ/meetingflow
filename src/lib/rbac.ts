import type { Role } from "@/generated/prisma/enums";

/**
 * Role based access control.
 *
 * One matrix, one `can()` helper. Every server action and every route handler
 * asks this module before touching data. Hiding a menu item in the UI is a
 * convenience, never the enforcement point.
 */

export const PERMISSIONS = [
  // requests — creation and own-record actions
  "request:create",
  "request:read:own",
  "request:read:reports",
  "request:read:all",
  "request:addInfo",
  "request:cancel:own",
  "request:requestReschedule",

  // requests — coordination actions
  "request:take",
  "request:assign",
  "request:logActivity",
  "request:schedule",
  "request:reschedule",
  "request:requestInfo",
  "request:decline",
  "request:cancel:any",
  /** Putting right a detail that was recorded wrong, after the fact. */
  "request:correct",

  // summaries and follow-up
  "summary:submit",
  "followup:create",
  "task:manage",

  // contacts
  "contact:read",
  "contact:manage",

  // analytics
  "analytics:self",
  "analytics:full",

  // meeting history
  "log:read:own",
  "log:read:all",

  // administration
  "users:manage",
  "departments:manage",
  "settings:manage",
  "audit:read:request",
  "audit:read:all",

  // looking at the product through another person's eyes
  "roles:preview",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const EMPLOYEE: Permission[] = [
  "request:create",
  "request:read:own",
  "request:addInfo",
  "request:cancel:own",
  "request:requestReschedule",
  "summary:submit",
  "followup:create",
  "task:manage",
  "contact:read",
  "log:read:own",
];

const COORDINATOR: Permission[] = [
  ...EMPLOYEE,
  "log:read:all",
  "request:read:all",
  "request:take",
  "request:assign",
  "request:logActivity",
  "request:schedule",
  "request:reschedule",
  "request:requestInfo",
  "request:decline",
  "request:cancel:any",
  "request:correct",
  "contact:manage",
  "analytics:self",
  "audit:read:request",
];

const MANAGER: Permission[] = [
  ...COORDINATOR,
  "request:read:reports",
  "analytics:full",
];

const ADMIN: Permission[] = [
  ...MANAGER,
  "users:manage",
  "departments:manage",
  "settings:manage",
  "audit:read:all",
];

/** Everything an administrator has, plus the right to preview other people. */
const DEVELOPER: Permission[] = [...ADMIN, "roles:preview"];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  EMPLOYEE: new Set(EMPLOYEE),
  COORDINATOR: new Set(COORDINATOR),
  MANAGER: new Set(MANAGER),
  ADMIN: new Set(ADMIN),
  DEVELOPER: new Set(DEVELOPER),
};

/**
 * How wide each level is, widest first. Used only to decide who may preview
 * whom: you can look through the eyes of someone at or below your own level,
 * never above it. It is not a substitute for the permission matrix.
 */
export const ROLE_ORDER: Role[] = [
  "DEVELOPER",
  "ADMIN",
  "MANAGER",
  "COORDINATOR",
  "EMPLOYEE",
];

const LEVEL: Record<Role, number> = {
  DEVELOPER: 0,
  ADMIN: 1,
  MANAGER: 2,
  COORDINATOR: 3,
  EMPLOYEE: 4,
};

/** True when `actor` is allowed to see the product as `target` sees it. */
export function canPreview(actor: Role, target: Role): boolean {
  return can(actor, "roles:preview") && LEVEL[actor] <= LEVEL[target];
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError(permission);
  }
}

export class ForbiddenError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/**
 * How wide a user's view of meeting requests is.
 *   ALL     — every request in the organization
 *   REPORTS — own requests plus those of direct and indirect reports
 *   OWN     — own requests, plus requests the user participates in
 */
export type VisibilityScope = "ALL" | "REPORTS" | "OWN";

export function visibilityScope(role: Role): VisibilityScope {
  if (can(role, "request:read:all")) return "ALL";
  if (can(role, "request:read:reports")) return "REPORTS";
  return "OWN";
}

/** Sidebar entries a role is allowed to see, in display order. */
export const NAV_PERMISSIONS: Record<string, Permission | null> = {
  dashboard: null,
  "my-day": null,
  "requests/new": "request:create",
  "my-requests": null,
  requests: "request:read:all",
  calendar: null,
  contacts: "contact:read",
  analytics: "analytics:self",
  notifications: null,
  "admin/users": "users:manage",
  "admin/audit": "audit:read:all",
  "admin/settings": "settings:manage",
};
