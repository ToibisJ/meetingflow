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

/**
 * The organization row is its own tenant: its primary key IS the id every other
 * table points at. It still gets filtered — just on `id` rather than on a
 * column it does not have.
 */
const SELF_SCOPED_MODEL = "Organization";

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

/**
 * Anything that changes a row. While one person is previewing the product as
 * another, the client is built read-only and these are refused here rather than
 * in each screen — a screen can forget, this cannot.
 */
const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "executeRaw",
  "queryRaw",
  "$executeRaw",
  "$queryRaw",
]);

/** Thrown when a preview session tries to change something. */
export class ReadOnlyError extends Error {
  constructor(model: string, operation: string) {
    super(`Read-only session: ${operation} on ${model} was refused`);
    this.name = "ReadOnlyError";
  }
}

type AnyArgs = Record<string, unknown>;

function withOrgId(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as AnyArgs), organizationId }));
  }
  return { ...(data as AnyArgs), organizationId };
}

export function tenantDb(organizationId: string, options: { readOnly?: boolean } = {}) {
  if (!organizationId) {
    throw new Error("tenantDb called without an organizationId");
  }

  const readOnly = options.readOnly === true;

  return db.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (readOnly && WRITE_OPERATIONS.has(operation)) {
            throw new ReadOnlyError(model, operation);
          }

          if (UNSCOPED_MODELS.has(model)) {
            return query(args);
          }

          const nextArgs = { ...(args as AnyArgs) };
          const scopeKey = model === SELF_SCOPED_MODEL ? "id" : "organizationId";

          if (WHERE_OPERATIONS.has(operation)) {
            nextArgs.where = {
              ...((nextArgs.where as AnyArgs) ?? {}),
              [scopeKey]: organizationId,
            };
          }

          // Creating an organization is an onboarding action, not tenant work,
          // so the guard never rewrites its data.
          if (model === SELF_SCOPED_MODEL) return query(nextArgs);

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
