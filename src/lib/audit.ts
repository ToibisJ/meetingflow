import type { TenantDb } from "./tenant";

/**
 * Audit logging.
 *
 * Requirement: no change may disappear. Rather than sprinkling log calls through
 * feature code, services hand the "before" and "after" snapshots to `writeAudit`,
 * which stores one row per changed field. Forgetting to log is therefore not a
 * thing an individual feature can do on its own.
 */

export type AuditActor = {
  userId: string | null;
  userName: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditInput = {
  /**
   * The tenant client injects this at runtime as well; passing it here keeps
   * the write type-checked and the injected value always wins.
   */
  organizationId: string;
  actor: AuditActor;
  entity: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Fields never worth auditing. */
  ignore?: string[];
};

const ALWAYS_IGNORED = ["updatedAt", "createdAt", "lastActivityAt", "passwordHash"];

/** Just the delegate we need — works with the tenant client and with a transaction. */
type AuditWriter = Pick<TenantDb, "auditLog">;

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Fields whose value differs between the two snapshots. */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  ignore: string[] = [],
): { field: string; oldValue: string | null; newValue: string | null }[] {
  const skip = new Set([...ALWAYS_IGNORED, ...ignore]);
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];

  for (const key of keys) {
    if (skip.has(key)) continue;
    const oldValue = serialize(before?.[key]);
    const newValue = serialize(after?.[key]);
    if (oldValue !== newValue) {
      changes.push({ field: key, oldValue, newValue });
    }
  }

  return changes;
}

/**
 * Writes the audit trail for one action.
 * Pass the same client/transaction the mutation ran on, so the log commits or
 * rolls back with the change it describes.
 */
export async function writeAudit(
  client: AuditWriter,
  input: AuditInput,
): Promise<void> {
  const { organizationId, actor, entity, entityId, action, before, after, ignore } =
    input;

  const base = {
    organizationId,
    userId: actor.userId,
    userName: actor.userName,
    entity,
    entityId,
    action,
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  };

  const changes = diffFields(before, after, ignore);

  // Creations and deletions have no field-level diff worth listing.
  if (changes.length === 0) {
    await client.auditLog.create({
      data: { ...base, field: null, oldValue: null, newValue: null },
    });
    return;
  }

  await client.auditLog.createMany({
    data: changes.map((change) => ({ ...base, ...change })),
  });
}
