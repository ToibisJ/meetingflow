import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  ActivityChannel,
  ActivityOutcome,
  MeetingType,
  Priority,
  RequestStatus,
} from "../src/generated/prisma/enums";

/**
 * Demo data.
 *
 * Two organizations are created on purpose: the second one exists so that
 * tenant isolation can actually be tested. Signing in as a user of one
 * organization must never surface a single row belonging to the other.
 *
 * Run with:  npx prisma db seed
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_PASSWORD = "Meeting2026!";

// ---------------------------------------------------------------- helpers

/** Deterministic PRNG so repeated seeds produce the same demo data. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260802);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function pickSome<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return out;
}

function intBetween(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

const NOW = new Date();

function shiftDays(days: number, hour: number, minute: number): Date {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/**
 * A point in the past. Clamped, because "0 days ago at 16:00" generated at
 * 09:00 would land in the future and make age and idle counters negative.
 */
function daysAgo(days: number, hour = 9, minute = 0): Date {
  const date = shiftDays(-days, hour, minute);
  return date.getTime() > NOW.getTime() ? new Date(NOW) : date;
}

/** A point in the future. Deliberately not clamped — meetings are booked ahead. */
function daysAhead(days: number, hour = 10, minute = 0): Date {
  return shiftDays(days, hour, minute);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

/** Timeline events walk forward in time, so they also need a ceiling of now. */
function noLaterThanNow(date: Date): Date {
  return date.getTime() > NOW.getTime() ? new Date(NOW) : date;
}

// ---------------------------------------------------------------- fixtures

const HE_FIRST_NAMES = [
  "יונתן", "דנה", "מיכל", "אורי", "נועה", "רון", "שירה", "עידו", "תמר", "אבי",
  "ליאת", "גיא", "הדר", "אסף", "מאיה", "ניר", "יעל", "עמית", "רותם", "אלון",
];

const HE_LAST_NAMES = [
  "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "שפירא", "דהן",
  "אזולאי", "רוזן", "גולן", "ברק", "שני", "הראל", "אדלר", "נחום", "טל",
];

const COMPANIES = [
  "דלתא תעשיות", "נובה מערכות", "אורביט טכנולוגיות", "כרמל לוגיסטיקה",
  "מרידיאן פיננסים", "ספיר רפואה", "אלטו תוכנה", "גלובוס שילוח",
  "תדהר בנייה", "אריאל ייעוץ", "מטריקס אנרגיה", "פסגות ביטוח",
  "רימון מזון", "אופק תקשורת", "יובל השקעות", "נביא סייבר",
  "אלמוג ימי", "שחף תעופה", "ברקת נדל\"ן", "אשל חקלאות",
];

const JOB_TITLES = [
  "מנהל רכש", "סמנכ\"ל תפעול", "מנהלת שיווק", "מנכ\"ל", "מנהל פיתוח עסקי",
  "ראש צוות מכירות", "מנהלת כספים", "מנהל טכנולוגיות", "יועצת אסטרטגית",
  "מנהל סניף",
];

const SUBJECTS = [
  "הצגת הצעת שיתוף פעולה",
  "פגישת היכרות ראשונית",
  "חידוש הסכם התקשרות",
  "בחינת פתרון טכנולוגי חדש",
  "סגירת תנאי מסחר לשנה הבאה",
  "הצגת מוצר למחלקת הרכש",
  "בירור דרישות פרויקט",
  "פגישת מעקב אחרי פיילוט",
  "תיאום ציפיות לקראת אספקה",
  "בחינת אפשרות להרחבת ההתקשרות",
  "מענה על מכרז",
  "פגישת סיכום רבעון",
];

const PURPOSES = [
  "להציג את היכולות שלנו ולבדוק התאמה",
  "להבין את הצרכים ולמפות הזדמנויות",
  "לסגור את התנאים המסחריים",
  "לקדם החלטה שנתקעה",
  "לחדש קשר שהיה רדום",
];

const OUTCOMES_WANTED = [
  "לקבוע פיילוט בהיקף מוגבל",
  "לקבל החלטה עקרונית עד סוף החודש",
  "להיפגש עם מקבל ההחלטות בפועל",
  "לקבל מסמך דרישות מסודר",
  "לחתום על הסכם מסגרת",
];

const NOTE_BODIES = [
  "הלקוח ביקש לחזור אליו אחרי החג",
  "המזכירה מסרה שהוא בחו\"ל השבוע",
  "הועבר חומר רקע במייל",
  "ביקש לצרף את איש הכספים לפגישה",
  "מעדיף פגישה בזום ולא פיזית",
];

const CHANNELS: ActivityChannel[] = ["PHONE", "EMAIL", "WHATSAPP", "LINKEDIN"];
const NO_ANSWER_OUTCOMES: ActivityOutcome[] = ["NO_ANSWER", "LEFT_MESSAGE"];
const TYPES: MeetingType[] = ["IN_PERSON", "PHONE", "VIDEO"];
const PRIORITIES: Priority[] = ["NORMAL", "NORMAL", "NORMAL", "HIGH", "HIGH", "URGENT"];

/** How many requests land in each status — 40 in total for the demo org. */
const STATUS_PLAN: { status: RequestStatus; count: number }[] = [
  { status: "NEW", count: 4 },
  { status: "NEEDS_COORDINATION", count: 6 },
  { status: "IN_PROGRESS", count: 5 },
  { status: "WAITING_FOR_CONTACT", count: 5 },
  { status: "WAITING_FOR_EMPLOYEE", count: 2 },
  { status: "SCHEDULED", count: 7 },
  { status: "RESCHEDULE_REQUESTED", count: 1 },
  { status: "RESCHEDULED", count: 2 },
  { status: "SUMMARY_REQUIRED", count: 3 },
  { status: "COMPLETED", count: 3 },
  { status: "CANCELLED", count: 1 },
  { status: "DECLINED", count: 1 },
];

// ---------------------------------------------------------------- main

async function main() {
  console.log("Clearing existing data…");
  // Order matters: children before parents.
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.followUpTask.deleteMany();
  await db.meetingSummary.deleteMany();
  await db.activity.deleteMany();
  await db.meeting.deleteMany();
  await db.meetingParticipant.deleteMany();
  await db.requestDateOption.deleteMany();
  await db.meetingRequest.deleteMany();
  await db.contact.deleteMany();
  await db.session.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.department.deleteMany();
  await db.organization.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  console.log("Creating the demo organization…");
  const org = await db.organization.create({
    data: {
      name: "אוטומטיקסי בע\"מ",
      slug: "automatixy",
      timezone: "Asia/Jerusalem",
      defaultLocale: "he",
    },
  });

  await db.setting.createMany({
    data: [
      { organizationId: org.id, key: "sla.new_request_hours", valueJson: 4 },
      { organizationId: org.id, key: "sla.no_activity_days", valueJson: 2 },
      { organizationId: org.id, key: "sla.waiting_contact_days", valueJson: 3 },
      { organizationId: org.id, key: "sla.summary_due_hours", valueJson: 24 },
    ],
  });

  // -------------------------------------------------------------- people

  const departments = await Promise.all(
    ["מכירות", "תפעול", "פיתוח עסקי", "כספים"].map((name) =>
      db.department.create({ data: { organizationId: org.id, name } }),
    ),
  );

  const admin = await db.user.create({
    data: {
      organizationId: org.id,
      email: "admin@automatixy.co.il",
      passwordHash,
      fullName: "יונתן טויביס",
      phone: "052-2580507",
      role: "ADMIN",
      departmentId: departments[2].id,
    },
  });

  const manager = await db.user.create({
    data: {
      organizationId: org.id,
      email: "manager@automatixy.co.il",
      passwordHash,
      fullName: "רונית שפירא",
      phone: "054-4782707",
      role: "MANAGER",
      departmentId: departments[0].id,
    },
  });

  await db.department.update({
    where: { id: departments[0].id },
    data: { managerUserId: manager.id },
  });

  const coordinators = await Promise.all(
    [
      { email: "dana@automatixy.co.il", fullName: "דנה לוי" },
      { email: "amit@automatixy.co.il", fullName: "עמית ברק" },
    ].map((person) =>
      db.user.create({
        data: {
          organizationId: org.id,
          email: person.email,
          passwordHash,
          fullName: person.fullName,
          role: "COORDINATOR",
          departmentId: departments[1].id,
          managerId: manager.id,
        },
      }),
    ),
  );

  const employees = await Promise.all(
    Array.from({ length: 10 }, (_, index) => {
      const fullName = `${HE_FIRST_NAMES[index]} ${HE_LAST_NAMES[index]}`;
      return db.user.create({
        data: {
          organizationId: org.id,
          email: `employee${index + 1}@automatixy.co.il`,
          passwordHash,
          fullName,
          phone: `05${intBetween(0, 8)}-${intBetween(1000000, 9999999)}`,
          role: "EMPLOYEE",
          departmentId: pick(departments).id,
          managerId: manager.id,
        },
      });
    }),
  );

  console.log(`Created ${employees.length + coordinators.length + 2} users.`);

  // -------------------------------------------------------------- contacts

  const contacts = await Promise.all(
    Array.from({ length: 30 }, (_, index) => {
      const fullName = `${pick(HE_FIRST_NAMES)} ${pick(HE_LAST_NAMES)}`;
      const company = COMPANIES[index % COMPANIES.length];
      const slug = `contact${index + 1}`;
      return db.contact.create({
        data: {
          organizationId: org.id,
          fullName,
          company,
          jobTitle: pick(JOB_TITLES),
          phone: `05${intBetween(0, 8)}-${intBetween(1000000, 9999999)}`,
          phoneAlt: random() > 0.7 ? `03-${intBetween(1000000, 9999999)}` : null,
          email: `${slug}@${company.replace(/[^a-z]/gi, "") || "example"}.co.il`,
          website: random() > 0.5 ? "https://example.co.il" : null,
          linkedin: random() > 0.7 ? "https://linkedin.com/in/example" : null,
          createdByUserId: pick(employees).id,
        },
      });
    }),
  );

  console.log(`Created ${contacts.length} contacts.`);

  // -------------------------------------------------------------- requests

  const statuses: RequestStatus[] = STATUS_PLAN.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.status),
  );

  let requestNumber = 1000;
  let createdRequests = 0;

  for (const status of statuses) {
    requestNumber += 1;
    createdRequests += 1;

    const requester = pick(employees);
    const contact = pick(contacts);
    const type = pick(TYPES);
    const priority = pick(PRIORITIES);
    const isOpen = !["COMPLETED", "CANCELLED", "DECLINED"].includes(status);

    const ageDays =
      status === "NEW"
        ? intBetween(0, 1)
        : status === "NEEDS_COORDINATION"
          ? intBetween(0, 4)
          : intBetween(3, 60);

    const createdAt = daysAgo(ageDays, intBetween(8, 16), intBetween(0, 59));
    const needsCoordinator = status !== "NEW" && status !== "NEEDS_COORDINATION";
    const coordinator = needsCoordinator ? pick(coordinators) : null;

    // SLA: new requests nobody picked up go amber/red as they age.
    let slaState: "GREEN" | "AMBER" | "RED" = "GREEN";
    if (status === "NEEDS_COORDINATION" && ageDays >= 1) slaState = "RED";
    else if (status === "WAITING_FOR_CONTACT" && ageDays > 10) slaState = "AMBER";
    else if (status === "SUMMARY_REQUIRED") slaState = "AMBER";

    const scheduledStart =
      status === "SCHEDULED"
        ? daysAhead(intBetween(0, 14), intBetween(9, 17), pick([0, 30]))
        : status === "RESCHEDULED"
          ? daysAhead(intBetween(1, 10), intBetween(9, 17), pick([0, 30]))
          : ["SUMMARY_REQUIRED", "COMPLETED"].includes(status)
            ? daysAgo(intBetween(1, 12), intBetween(9, 17), pick([0, 30]))
            : null;

    // A handful of today's meetings so the "today" tile is never empty.
    const forcedToday = status === "SCHEDULED" && createdRequests % 3 === 0;
    const start = forcedToday
      ? daysAhead(0, intBetween(9, 17), pick([0, 30]))
      : scheduledStart;

    const request = await db.meetingRequest.create({
      data: {
        organizationId: org.id,
        requestNumber,
        type,
        priority,
        status,
        slaState,
        contactId: contact.id,
        requesterUserId: requester.id,
        assignedCoordinatorId: coordinator?.id ?? null,
        subject: pick(SUBJECTS),
        purpose: pick(PURPOSES),
        description:
          "הלקוח הגיע דרך המלצה של לקוח קיים. חשוב להגיע לפגישה עם נתוני ביצועים מהפיילוט הקודם.",
        desiredOutcome: pick(OUTCOMES_WANTED),
        hadPriorContact: random() > 0.6,
        priorContactBy: random() > 0.6 ? requester.fullName : null,
        priorContactNotes: random() > 0.8 ? pick(NOTE_BODIES) : null,
        datePreferenceMode: pick(["EXACT", "OPTIONS", "RANGE", "NONE"] as const),
        preferredDate: daysAhead(intBetween(3, 20)),
        preferredTime: pick(["09:00", "10:30", "12:00", "14:00", "16:30"]),
        rangeStart: daysAhead(intBetween(2, 6)),
        rangeEnd: daysAhead(intBetween(10, 25)),
        firstTouchAt: needsCoordinator ? addMinutes(createdAt, intBetween(10, 400)) : null,
        lastActivityAt: createdAt,
        scheduledAt: start,
        closedAt: isOpen ? null : daysAgo(intBetween(0, 5)),
        createdAt,
      },
    });

    // participants
    const extraParticipants = pickSome(
      employees.filter((employee) => employee.id !== requester.id),
      intBetween(0, 2),
    );
    await db.meetingParticipant.createMany({
      data: [
        { requestId: request.id, userId: requester.id, isOrganizer: true },
        ...extraParticipants.map((participant) => ({
          requestId: request.id,
          userId: participant.id,
          isOrganizer: false,
        })),
      ],
    });

    // date options
    if (request.datePreferenceMode === "OPTIONS") {
      await db.requestDateOption.createMany({
        data: Array.from({ length: 3 }, (_, rank) => ({
          requestId: request.id,
          rank,
          optionDate: daysAhead(intBetween(3, 20)),
          optionTime: pick(["09:00", "11:00", "14:00", "16:00"]),
        })),
      });
    }

    // ------------------------------------------------------ timeline

    const timeline: {
      type: Parameters<typeof db.activity.create>[0]["data"]["type"];
      actorUserId: string | null;
      channel?: ActivityChannel | null;
      outcome?: ActivityOutcome | null;
      body?: string | null;
      occurredAt: Date;
    }[] = [];

    timeline.push({
      type: "REQUEST_CREATED",
      actorUserId: requester.id,
      occurredAt: createdAt,
    });

    let cursor = createdAt;

    if (coordinator) {
      cursor = addMinutes(cursor, intBetween(15, 300));
      timeline.push({ type: "ASSIGNED", actorUserId: coordinator.id, occurredAt: cursor });

      const attempts = intBetween(1, 4);
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        cursor = addMinutes(cursor, intBetween(60, 900));
        timeline.push({
          type: "CONTACT_ATTEMPT",
          actorUserId: coordinator.id,
          channel: pick(CHANNELS),
          outcome: pick(NO_ANSWER_OUTCOMES),
          occurredAt: cursor,
        });
      }

      if (
        ["SCHEDULED", "RESCHEDULED", "SUMMARY_REQUIRED", "COMPLETED", "RESCHEDULE_REQUESTED"].includes(
          status,
        )
      ) {
        cursor = addMinutes(cursor, intBetween(60, 600));
        timeline.push({
          type: "REPLY_RECEIVED",
          actorUserId: null,
          channel: "EMAIL",
          outcome: "POSITIVE",
          occurredAt: cursor,
        });

        cursor = addMinutes(cursor, intBetween(5, 90));
        timeline.push({
          type: "OPTIONS_OFFERED",
          actorUserId: coordinator.id,
          body: "הוצעו שלושה מועדים",
          occurredAt: cursor,
        });

        cursor = addMinutes(cursor, intBetween(30, 600));
        timeline.push({ type: "SCHEDULED", actorUserId: coordinator.id, occurredAt: cursor });
      }

      if (status === "WAITING_FOR_EMPLOYEE") {
        cursor = addMinutes(cursor, intBetween(30, 400));
        timeline.push({
          type: "INFO_REQUESTED",
          actorUserId: coordinator.id,
          body: "חסר מספר טלפון ישיר של איש הקשר",
          occurredAt: cursor,
        });
      }

      if (status === "RESCHEDULE_REQUESTED") {
        cursor = addMinutes(cursor, intBetween(120, 900));
        timeline.push({
          type: "NOTE",
          actorUserId: requester.id,
          body: "הלקוח ביקש להזיז את הפגישה",
          occurredAt: cursor,
        });
      }

      if (status === "RESCHEDULED") {
        cursor = addMinutes(cursor, intBetween(120, 900));
        timeline.push({ type: "RESCHEDULED", actorUserId: coordinator.id, occurredAt: cursor });
      }

      if (status === "DECLINED") {
        cursor = addMinutes(cursor, intBetween(60, 600));
        timeline.push({
          type: "DECLINED",
          actorUserId: coordinator.id,
          channel: "PHONE",
          outcome: "NEGATIVE",
          body: "אמר שאין תקציב השנה",
          occurredAt: cursor,
        });
      }

      if (status === "CANCELLED") {
        cursor = addMinutes(cursor, intBetween(60, 600));
        timeline.push({
          type: "CANCELLED",
          actorUserId: requester.id,
          body: "הבקשה כבר לא רלוונטית",
          occurredAt: cursor,
        });
      }

      if (random() > 0.6) {
        cursor = addMinutes(cursor, intBetween(30, 300));
        timeline.push({
          type: "NOTE",
          actorUserId: coordinator.id,
          body: pick(NOTE_BODIES),
          occurredAt: cursor,
        });
      }
    }

    await db.activity.createMany({
      data: timeline.map((event) => ({
        organizationId: org.id,
        requestId: request.id,
        actorUserId: event.actorUserId,
        type: event.type,
        channel: event.channel ?? null,
        outcome: event.outcome ?? null,
        body: event.body ?? null,
        occurredAt: noLaterThanNow(event.occurredAt),
      })),
    });

    await db.meetingRequest.update({
      where: { id: request.id },
      data: {
        lastActivityAt: noLaterThanNow(timeline[timeline.length - 1].occurredAt),
      },
    });

    // ------------------------------------------------------ meeting

    if (start) {
      const duration = pick([30, 45, 60, 90]);
      const meeting = await db.meeting.create({
        data: {
          organizationId: org.id,
          requestId: request.id,
          scheduledStart: start,
          scheduledEnd: addMinutes(start, duration),
          location:
            type === "IN_PERSON"
              ? `משרדי ${contact.company}`
              : type === "PHONE"
                ? null
                : null,
          meetingUrl: type === "VIDEO" ? "https://meet.google.com/demo-link" : null,
          dialNumber: type === "PHONE" ? contact.phone : null,
          status:
            status === "COMPLETED"
              ? "HELD"
              : status === "RESCHEDULED"
                ? "RESCHEDULED"
                : "PLANNED",
          createdByUserId: coordinator?.id ?? null,
        },
      });

      // -------------------------------------------------- summary

      if (status === "COMPLETED") {
        const summary = await db.meetingSummary.create({
          data: {
            organizationId: org.id,
            requestId: request.id,
            meetingId: meeting.id,
            submittedByUserId: requester.id,
            tookPlace: true,
            summary:
              "הפגישה התקיימה כמתוכנן. הוצגו היכולות והתקבלה התעניינות אמיתית. סוכם על המשך בירור מול הגורם הטכני.",
            outcome: pick(["SUCCESS", "FOLLOW_UP_NEEDED", "ANOTHER_MEETING"] as const),
            needsFollowupMeeting: random() > 0.5,
            submittedAt: addMinutes(start, duration + intBetween(60, 600)),
          },
        });

        await db.followUpTask.createMany({
          data: Array.from({ length: intBetween(1, 3) }, () => ({
            organizationId: org.id,
            requestId: request.id,
            summaryId: summary.id,
            description: pick([
              "לשלוח הצעת מחיר מפורטת",
              "לתאם שיחה עם הגורם הטכני",
              "להעביר מסמך אפיון",
              "לבדוק זמינות צוות ליישום",
            ]),
            assigneeUserId: pick([requester.id, coordinator?.id ?? requester.id]),
            dueDate: daysAhead(intBetween(3, 21)),
          })),
        });

        await db.activity.create({
          data: {
            organizationId: org.id,
            requestId: request.id,
            actorUserId: requester.id,
            type: "SUMMARY_SUBMITTED",
            occurredAt: summary.submittedAt,
          },
        });
      }
    }

    // ------------------------------------------------------ notifications

    if (["SCHEDULED", "RESCHEDULED"].includes(status)) {
      await db.notification.create({
        data: {
          organizationId: org.id,
          userId: requester.id,
          type: status === "SCHEDULED" ? "MEETING_SCHEDULED" : "MEETING_RESCHEDULED",
          title: status === "SCHEDULED" ? "הפגישה שלך נקבעה" : "הפגישה הוזזה",
          body: `${contact.fullName} — ${request.subject}`,
          entityType: "MeetingRequest",
          entityId: request.id,
          isRead: random() > 0.5,
          createdAt: cursor,
        },
      });
    }

    if (status === "SUMMARY_REQUIRED") {
      await db.notification.create({
        data: {
          organizationId: org.id,
          userId: requester.id,
          type: "SUMMARY_REQUIRED",
          title: "הפגישה הסתיימה, נא למלא סיכום",
          body: `${contact.fullName} — ${request.subject}`,
          entityType: "MeetingRequest",
          entityId: request.id,
          isRead: false,
          createdAt: cursor,
        },
      });
    }

    if (status === "WAITING_FOR_EMPLOYEE") {
      await db.notification.create({
        data: {
          organizationId: org.id,
          userId: requester.id,
          type: "INFO_REQUESTED",
          title: "המתאם מבקש ממך מידע נוסף",
          body: `${contact.fullName} — ${request.subject}`,
          entityType: "MeetingRequest",
          entityId: request.id,
          isRead: false,
          createdAt: cursor,
        },
      });
    }

    // ------------------------------------------------------ audit trail

    await db.auditLog.create({
      data: {
        organizationId: org.id,
        userId: requester.id,
        userName: requester.fullName,
        entity: "MeetingRequest",
        entityId: request.id,
        action: "create",
        occurredAt: createdAt,
      },
    });

    if (coordinator) {
      await db.auditLog.createMany({
        data: [
          {
            organizationId: org.id,
            userId: coordinator.id,
            userName: coordinator.fullName,
            entity: "MeetingRequest",
            entityId: request.id,
            action: "update",
            field: "assignedCoordinatorId",
            oldValue: null,
            newValue: coordinator.id,
            occurredAt: addMinutes(createdAt, 20),
          },
          {
            organizationId: org.id,
            userId: coordinator.id,
            userName: coordinator.fullName,
            entity: "MeetingRequest",
            entityId: request.id,
            action: "update",
            field: "status",
            oldValue: "NEEDS_COORDINATION",
            newValue: status,
            occurredAt: addMinutes(createdAt, 25),
          },
        ],
      });
    }
  }

  console.log(`Created ${createdRequests} meeting requests.`);

  // -------------------------------------------------------------- tenant B

  console.log("Creating a second organization for isolation testing…");
  const otherOrg = await db.organization.create({
    data: {
      name: "חברת בדיקה בע\"מ",
      slug: "tenant-b",
      timezone: "Asia/Jerusalem",
      defaultLocale: "he",
    },
  });

  const otherAdmin = await db.user.create({
    data: {
      organizationId: otherOrg.id,
      email: "admin@tenant-b.co.il",
      passwordHash,
      fullName: "מנהל חברה ב",
      role: "ADMIN",
    },
  });

  const otherContact = await db.contact.create({
    data: {
      organizationId: otherOrg.id,
      fullName: "איש קשר של חברה ב",
      company: "לקוח של חברה ב",
      createdByUserId: otherAdmin.id,
    },
  });

  await db.meetingRequest.create({
    data: {
      organizationId: otherOrg.id,
      requestNumber: 1,
      type: "IN_PERSON",
      status: "NEEDS_COORDINATION",
      contactId: otherContact.id,
      requesterUserId: otherAdmin.id,
      subject: "בקשה של חברה ב שאסור שתיראה בחברה א",
    },
  });

  console.log("\nDone.\n");
  console.log("Sign in with any of these — the password is the same for all:");
  console.log(`  admin@automatixy.co.il      ${DEMO_PASSWORD}   (מנהל מערכת)`);
  console.log(`  manager@automatixy.co.il    ${DEMO_PASSWORD}   (מנהל)`);
  console.log(`  dana@automatixy.co.il       ${DEMO_PASSWORD}   (מתאמת)`);
  console.log(`  amit@automatixy.co.il       ${DEMO_PASSWORD}   (מתאם)`);
  console.log(`  employee1@automatixy.co.il  ${DEMO_PASSWORD}   (עובד)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
