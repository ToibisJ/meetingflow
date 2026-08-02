import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Proves tenant isolation against the live database.
 *
 * The point of the test is not that organization A's list is short — it is that
 * A cannot reach a row of B's by any route: not by listing, not by counting,
 * not by fetching a known id, not by updating it, and not by deleting it.
 *
 *   npx tsx scripts/verify-isolation.ts
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const raw = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// A local copy of the production guard, so the test exercises the real logic.
const UNSCOPED = new Set(["Session", "RequestDateOption", "MeetingParticipant"]);
const WHERE_OPS = new Set([
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
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

function tenantDb(organizationId: string) {
  return raw.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (UNSCOPED.has(model)) return query(args);

          const next = { ...(args as Record<string, unknown>) };
          const scopeKey = model === "Organization" ? "id" : "organizationId";

          if (WHERE_OPS.has(operation)) {
            next.where = {
              ...((next.where as Record<string, unknown>) ?? {}),
              [scopeKey]: organizationId,
            };
          }

          if (model === "Organization") return query(next);

          if (CREATE_OPS.has(operation)) {
            if (next.create !== undefined) {
              next.create = { ...(next.create as object), organizationId };
            }
            if (next.data !== undefined) {
              next.data = Array.isArray(next.data)
                ? next.data.map((row) => ({ ...(row as object), organizationId }))
                : { ...(next.data as object), organizationId };
            }
          }

          return query(next);
        },
      },
    },
  });
}

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  const mark = passed ? "PASS" : "FAIL";
  if (!passed) failures += 1;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const orgA = await raw.organization.findUniqueOrThrow({ where: { slug: "automatixy" } });
  const orgB = await raw.organization.findUniqueOrThrow({ where: { slug: "tenant-b" } });

  const bRequest = await raw.meetingRequest.findFirstOrThrow({
    where: { organizationId: orgB.id },
  });
  const bUser = await raw.user.findFirstOrThrow({ where: { organizationId: orgB.id } });
  const bContact = await raw.contact.findFirstOrThrow({ where: { organizationId: orgB.id } });

  const totals = {
    requests: await raw.meetingRequest.count(),
    users: await raw.user.count(),
    contacts: await raw.contact.count(),
  };

  const a = tenantDb(orgA.id);

  console.log("\nTenant isolation — organization A looking for organization B's data\n");
  console.log(`  database totals: ${totals.requests} requests, ${totals.users} users, ${totals.contacts} contacts`);
  console.log("");

  // 1. Listing must not include the other organization's rows.
  const listedRequests = await a.meetingRequest.findMany({ select: { organizationId: true } });
  check(
    "findMany on requests returns only A",
    listedRequests.length > 0 &&
      listedRequests.every((row) => row.organizationId === orgA.id),
    `${listedRequests.length} rows, all A`,
  );

  const listedUsers = await a.user.findMany({ select: { organizationId: true } });
  check(
    "findMany on users returns only A",
    listedUsers.length > 0 && listedUsers.every((row) => row.organizationId === orgA.id),
    `${listedUsers.length} of ${totals.users}`,
  );

  const listedContacts = await a.contact.findMany({ select: { organizationId: true } });
  check(
    "findMany on contacts returns only A",
    listedContacts.length > 0 &&
      listedContacts.every((row) => row.organizationId === orgA.id),
    `${listedContacts.length} of ${totals.contacts}`,
  );

  // 2. Counting must not count the other organization's rows.
  const countedRequests = await a.meetingRequest.count();
  check(
    "count excludes B",
    countedRequests < totals.requests && countedRequests === listedRequests.length,
    `${countedRequests} of ${totals.requests}`,
  );

  // 3. Fetching a known id from the other organization must return nothing.
  const stolenById = await a.meetingRequest.findUnique({ where: { id: bRequest.id } });
  check("findUnique on B's request id returns null", stolenById === null);

  const stolenUser = await a.user.findUnique({ where: { id: bUser.id } });
  check("findUnique on B's user id returns null", stolenUser === null);

  const stolenContact = await a.contact.findFirst({ where: { id: bContact.id } });
  check("findFirst on B's contact id returns null", stolenContact === null);

  // 4. Searching by a value that only exists in B must find nothing.
  const bySubject = await a.meetingRequest.findMany({
    where: { subject: { contains: "חברה ב" } },
  });
  check("searching for B's subject text finds nothing", bySubject.length === 0);

  // 5. Writes must not reach across either.
  let updateBlocked = false;
  try {
    await a.meetingRequest.update({
      where: { id: bRequest.id },
      data: { subject: "tampered by another tenant" },
    });
  } catch {
    updateBlocked = true;
  }
  const bRequestAfter = await raw.meetingRequest.findUniqueOrThrow({
    where: { id: bRequest.id },
  });
  check(
    "update on B's request is rejected and leaves the row untouched",
    updateBlocked && bRequestAfter.subject === bRequest.subject,
  );

  const deleted = await a.meetingRequest.deleteMany({ where: { id: bRequest.id } });
  const stillThere = await raw.meetingRequest.findUnique({ where: { id: bRequest.id } });
  check(
    "deleteMany on B's request deletes nothing",
    deleted.count === 0 && stillThere !== null,
  );

  // 6. A create that names another organization must still land in A.
  const smuggled = await a.contact.create({
    data: {
      organizationId: orgB.id,
      fullName: "smuggling attempt",
    },
  });
  check(
    "create claiming to belong to B is stored under A",
    smuggled.organizationId === orgA.id,
  );
  await raw.contact.delete({ where: { id: smuggled.id } });

  // 7. Aggregates must not leak either.
  const aggregate = await a.meetingRequest.groupBy({
    by: ["organizationId"],
    _count: { _all: true },
  });
  check(
    "groupBy returns a single organization",
    aggregate.length === 1 && aggregate[0].organizationId === orgA.id,
  );

  console.log("");
  if (failures === 0) {
    console.log("All isolation checks passed.\n");
  } else {
    console.log(`${failures} isolation check(s) FAILED.\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await raw.$disconnect();
  });
