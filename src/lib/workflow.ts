import type { RequestStatus } from "@/generated/prisma/enums";
import type { Permission } from "./rbac";

/**
 * The meeting-request state machine.
 *
 * No code anywhere may write `status` directly. Every change goes through
 * `assertTransition` inside the request service, which also writes the timeline
 * event, the audit rows and the notifications in the same transaction.
 */

export type TransitionRule = {
  to: RequestStatus;
  /** Permission the actor must hold. */
  permission: Permission;
  /** True when the system performs the move on its own (cron, timers). */
  system?: boolean;
};

export const TRANSITIONS: Record<RequestStatus, TransitionRule[]> = {
  NEW: [
    { to: "NEEDS_COORDINATION", permission: "request:create", system: true },
    { to: "CANCELLED", permission: "request:cancel:own" },
  ],

  NEEDS_COORDINATION: [
    { to: "IN_PROGRESS", permission: "request:take" },
    { to: "WAITING_FOR_EMPLOYEE", permission: "request:requestInfo" },
    { to: "CANCELLED", permission: "request:cancel:own" },
  ],

  IN_PROGRESS: [
    { to: "WAITING_FOR_CONTACT", permission: "request:logActivity" },
    { to: "WAITING_FOR_EMPLOYEE", permission: "request:requestInfo" },
    { to: "SCHEDULED", permission: "request:schedule" },
    { to: "DECLINED", permission: "request:decline" },
    { to: "CANCELLED", permission: "request:cancel:own" },
  ],

  WAITING_FOR_CONTACT: [
    { to: "IN_PROGRESS", permission: "request:logActivity" },
    { to: "SCHEDULED", permission: "request:schedule" },
    { to: "DECLINED", permission: "request:decline" },
    { to: "CANCELLED", permission: "request:cancel:own" },
  ],

  WAITING_FOR_EMPLOYEE: [
    { to: "IN_PROGRESS", permission: "request:addInfo" },
    { to: "CANCELLED", permission: "request:cancel:own" },
  ],

  SCHEDULED: [
    { to: "RESCHEDULE_REQUESTED", permission: "request:requestReschedule" },
    { to: "SUMMARY_REQUIRED", permission: "request:schedule", system: true },
    { to: "CANCELLED", permission: "request:cancel:own" },
    { to: "DECLINED", permission: "request:decline" },
  ],

  RESCHEDULE_REQUESTED: [
    { to: "RESCHEDULED", permission: "request:reschedule" },
    { to: "CANCELLED", permission: "request:cancel:own" },
    { to: "DECLINED", permission: "request:decline" },
  ],

  RESCHEDULED: [
    { to: "RESCHEDULE_REQUESTED", permission: "request:requestReschedule" },
    { to: "SUMMARY_REQUIRED", permission: "request:schedule", system: true },
    { to: "CANCELLED", permission: "request:cancel:own" },
    { to: "DECLINED", permission: "request:decline" },
  ],

  SUMMARY_REQUIRED: [{ to: "COMPLETED", permission: "summary:submit" }],

  // terminal
  COMPLETED: [],
  CANCELLED: [],
  DECLINED: [],
};

/** Statuses that mean the request is finished and needs no further work. */
export const TERMINAL_STATUSES: RequestStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "DECLINED",
];

/** Statuses that mean a meeting is booked in the future. */
export const BOOKED_STATUSES: RequestStatus[] = ["SCHEDULED", "RESCHEDULED"];

/** Statuses that count as open work for the coordination desk. */
export const OPEN_STATUSES: RequestStatus[] = [
  "NEW",
  "NEEDS_COORDINATION",
  "IN_PROGRESS",
  "WAITING_FOR_CONTACT",
  "WAITING_FOR_EMPLOYEE",
  "RESCHEDULE_REQUESTED",
];

export class InvalidTransitionError extends Error {
  constructor(from: RequestStatus, to: RequestStatus) {
    super(`Illegal status transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function allowedTransitions(from: RequestStatus): TransitionRule[] {
  return TRANSITIONS[from] ?? [];
}

export function isTransitionAllowed(
  from: RequestStatus,
  to: RequestStatus,
): boolean {
  return allowedTransitions(from).some((rule) => rule.to === to);
}

/**
 * Returns the rule for a legal transition, or throws.
 * The caller still has to check the returned rule's permission against the actor.
 */
export function assertTransition(
  from: RequestStatus,
  to: RequestStatus,
): TransitionRule {
  const rule = allowedTransitions(from).find((candidate) => candidate.to === to);
  if (!rule) {
    throw new InvalidTransitionError(from, to);
  }
  return rule;
}
