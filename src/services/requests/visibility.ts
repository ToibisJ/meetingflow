import "server-only";

import type { SessionUser } from "@/lib/session";
import type { TenantDb } from "@/lib/tenant";
import { visibilityScope } from "@/lib/rbac";

/**
 * Row-level visibility for meeting requests.
 *
 * The tenant client already guarantees the rows belong to the signed-in user's
 * organization. This adds the second filter: which of those rows this
 * particular user is allowed to see.
 *
 * Every list, count, search and AI grounding query composes this. Nothing reads
 * requests without it.
 */

export type RequestVisibilityFilter = Record<string, unknown>;

/** Direct and indirect reports of a manager, resolved breadth-first. */
async function reportIds(db: TenantDb, managerId: string): Promise<string[]> {
  const collected = new Set<string>([managerId]);
  let frontier = [managerId];

  // Depth is bounded so a cycle in the manager chain cannot hang the request.
  for (let depth = 0; depth < 6 && frontier.length > 0; depth += 1) {
    const rows = await db.user.findMany({
      where: { managerId: { in: frontier } },
      select: { id: true },
    });

    frontier = rows.map((row) => row.id).filter((id) => !collected.has(id));
    frontier.forEach((id) => collected.add(id));
  }

  return [...collected];
}

export async function requestVisibility(
  db: TenantDb,
  session: SessionUser,
): Promise<RequestVisibilityFilter> {
  const scope = visibilityScope(session.role);

  if (scope === "ALL") return {};

  if (scope === "REPORTS") {
    const ids = await reportIds(db, session.id);
    const managed = await db.department.findMany({
      where: { managerUserId: session.id },
      select: { id: true },
    });

    return {
      OR: [
        { requesterUserId: { in: ids } },
        { assignedCoordinatorId: { in: ids } },
        { participants: { some: { userId: session.id } } },
        ...(managed.length > 0
          ? [{ requester: { departmentId: { in: managed.map((row) => row.id) } } }]
          : []),
      ],
    };
  }

  // An employee sees what they opened and what they take part in.
  return {
    OR: [
      { requesterUserId: session.id },
      { participants: { some: { userId: session.id } } },
    ],
  };
}
