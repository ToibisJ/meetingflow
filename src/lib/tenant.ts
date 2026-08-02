import { db } from "./db";

/**
 * Tenant isolation — the single mechanism that keeps organizations apart.
 *
 * Every query made through this client gets `organizationId` injected:
 *   - reads   -> merged into `where`
 *   - writes  -> merged into `data` (create / createMany) and `where` (update / delete)
 *
 * Because the filter is injected rather than hand-written, a forgotten
 * `where` clause in feature code cannot leak another organization's rows.
 *
 * Usage (server side only):
 *   const tx = tenantDb(session.organizationId)
 *   const rows = await tx.meetingRequest.findMany()   // already scoped
 */

/**
 * Models that carry no organizationId column of their own.
 * Each is reachable only through a parent row that IS scoped, so the parent's
 * filter protects them. Never add a model here to "make an error go away".
 */
const UNSCOPED_MODELS = new Set([
  "Session", // keyed by token hash, resolved before a tenant is known
  "RequestDateOption", // child of MeetingRequest
  "MeetingParticipant", // child of MeetingRequest
]);

const WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

type AnyArgs = Record<string, unknown>;

function withOrgId(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as AnyArgs), organizationId }));
  }
  return { ...(data as AnyArgs), organizationId };
}

export function tenantDb(organizationId: string) {
  if (!organizationId) {
    throw new Error("tenantDb called without an organizationId");
  }

  return db.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (UNSCOPED_MODELS.has(model)) {
            return query(args);
          }

          const nextArgs = { ...(args as AnyArgs) };

          if (WHERE_OPERATIONS.has(operation)) {
            nextArgs.where = {
              ...((nextArgs.where as AnyArgs) ?? {}),
              organizationId,
            };
          }

          if (CREATE_OPERATIONS.has(operation)) {
            // upsert carries both `create` and `update`; create/createMany carry `data`
            if (nextArgs.create !== undefined) {
              nextArgs.create = withOrgId(nextArgs.create, organizationId);
            }
            if (nextArgs.data !== undefined) {
              nextArgs.data = withOrgId(nextArgs.data, organizationId);
            }
          }

          return query(nextArgs);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
