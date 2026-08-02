import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { computePriority } from "../src/services/ai/priority";

/**
 * Exports a read-only snapshot of the demo organization for the public preview.
 *
 * Everything in the preview therefore comes from the real database — the same
 * requests, the same names, the same computed priority scores. Nothing in it is
 * written by hand.
 *
 *   npx tsx scripts/export-demo.ts <output path>
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const OPEN = [
  "NEW",
  "NEEDS_COORDINATION",
  "IN_PROGRESS",
  "WAITING_FOR_CONTACT",
  "WAITING_FOR_EMPLOYEE",
  "RESCHEDULE_REQUESTED",
] as const;

const BOOKED = ["SCHEDULED", "RESCHEDULED"] as const;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000);
}

async function main() {
  const outputPath = process.argv[2] ?? "demo-data.json";

  const org = await db.organization.findUniqueOrThrow({
    where: { slug: "automatixy" },
  });
  const where = { organizationId: org.id };

  const dana = await db.user.findFirstOrThrow({
    where: { ...where, email: "dana@automatixy.co.il" },
  });

  const counters = {
    needsCoordination: await db.meetingRequest.count({
      where: { ...where, status: { in: ["NEW", "NEEDS_COORDINATION"] } },
    }),
    inProgress: await db.meetingRequest.count({
      where: { ...where, status: "IN_PROGRESS" },
    }),
    waiting: await db.meetingRequest.count({
      where: {
        ...where,
        status: { in: ["WAITING_FOR_CONTACT", "WAITING_FOR_EMPLOYEE"] },
      },
    }),
    scheduled: await db.meetingRequest.count({
      where: { ...where, status: { in: [...BOOKED] } },
    }),
    today: await db.meetingRequest.count({
      where: {
        ...where,
        status: { in: [...BOOKED] },
        scheduledAt: { gte: startOfToday(), lte: endOfToday() },
      },
    }),
    completed: await db.meetingRequest.count({
      where: { ...where, status: "COMPLETED" },
    }),
  };

  const attention = {
    untouched: await db.meetingRequest.count({
      where: {
        ...where,
        status: { in: ["NEW", "NEEDS_COORDINATION"] },
        createdAt: { lt: hoursAgo(4) },
      },
    }),
    noReply: await db.meetingRequest.count({
      where: {
        ...where,
        status: "WAITING_FOR_CONTACT",
        lastActivityAt: { lt: daysAgo(3) },
      },
    }),
    today: counters.today,
    missingSummary: await db.meetingRequest.count({
      where: { ...where, status: "SUMMARY_REQUIRED" },
    }),
    stale: await db.meetingRequest.count({
      where: {
        ...where,
        status: { in: OPEN.filter((s) => s !== "NEW") },
        lastActivityAt: { lt: daysAgo(2) },
      },
    }),
  };

  const rows = await db.meetingRequest.findMany({
    where,
    select: {
      id: true,
      requestNumber: true,
      subject: true,
      purpose: true,
      status: true,
      priority: true,
      type: true,
      slaState: true,
      createdAt: true,
      lastActivityAt: true,
      preferredDate: true,
      scheduledAt: true,
      contact: { select: { fullName: true, company: true, jobTitle: true, phone: true } },
      requester: { select: { fullName: true } },
      coordinator: { select: { fullName: true } },
      participants: { select: { user: { select: { fullName: true } } } },
      activities: {
        select: {
          type: true,
          channel: true,
          outcome: true,
          body: true,
          occurredAt: true,
          actor: { select: { fullName: true } },
        },
        orderBy: { occurredAt: "asc" },
      },
      summaries: {
        select: { summary: true, outcome: true, submittedAt: true },
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
      _count: { select: { activities: true } },
    },
    orderBy: { requestNumber: "asc" },
  });

  const requests = rows.map((row) => {
    const attempts = row.activities.filter((a) => a.type === "CONTACT_ATTEMPT").length;
    const score = computePriority({
      priority: row.priority,
      status: row.status,
      slaState: row.slaState,
      createdAt: row.createdAt,
      lastActivityAt: row.lastActivityAt,
      preferredDate: row.preferredDate,
      scheduledAt: row.scheduledAt,
      contactAttempts: attempts,
      replyReceived: row.activities.some((a) => a.type === "REPLY_RECEIVED"),
      companyRequestCount: 0,
    });

    return {
      number: row.requestNumber,
      subject: row.subject,
      purpose: row.purpose,
      status: row.status,
      priority: row.priority,
      type: row.type,
      sla: row.slaState,
      contact: row.contact.fullName,
      company: row.contact.company,
      jobTitle: row.contact.jobTitle,
      phone: row.contact.phone,
      requester: row.requester.fullName,
      coordinator: row.coordinator?.fullName ?? null,
      participants: row.participants.map((p) => p.user.fullName),
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt.toISOString(),
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      openDays: Math.floor((Date.now() - row.createdAt.getTime()) / 86_400_000),
      idleDays: Math.floor((Date.now() - row.lastActivityAt.getTime()) / 86_400_000),
      attempts,
      score: score.score,
      band: score.band,
      factors: score.factors,
      summary: row.summaries[0]?.summary ?? null,
      timeline: row.activities.map((a) => ({
        at: a.occurredAt.toISOString(),
        type: a.type,
        channel: a.channel,
        outcome: a.outcome,
        body: a.body,
        actor: a.actor?.fullName ?? null,
      })),
    };
  });

  const people = await db.user.findMany({
    where,
    select: {
      fullName: true,
      role: true,
      department: { select: { name: true } },
    },
    orderBy: { role: "asc" },
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    organization: org.name,
    viewer: { fullName: dana.fullName, role: dana.role },
    counters,
    attention,
    requests,
    people: people.map((p) => ({
      name: p.fullName,
      role: p.role,
      department: p.department?.name ?? null,
    })),
  };

  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(
    `wrote ${outputPath}: ${requests.length} requests, ${people.length} people`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
