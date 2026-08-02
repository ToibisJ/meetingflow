import { z } from "zod";

/**
 * Every AI feature returns structured JSON validated against one of these
 * schemas. Free-form text is used only where the output IS prose the user will
 * read and edit (a draft email, a brief) — and even then it is wrapped in a
 * schema so the surrounding fields stay machine-checkable.
 *
 * Validation happens before anything is stored. An output that fails its schema
 * is discarded, not repaired.
 */

// ---------------------------------------------------------------- shared

export const SeveritySchema = z.enum(["critical", "warning", "info", "success"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** A recommendation always points at something the user can open. */
export const RecommendedActionSchema = z.object({
  title: z.string().describe("One short sentence in the user's language"),
  reason: z.string().describe("Why this is worth doing now, grounded in the data given"),
  severity: SeveritySchema,
  requestNumber: z
    .number()
    .int()
    .nullable()
    .describe("The request this points to, or null for a general action"),
});

export const CommandCenterSchema = z.object({
  greeting: z.string().describe("One warm sentence addressed to the user by name"),
  headline: z
    .string()
    .describe("One sentence summarising the current workload, using only the numbers provided"),
  actions: z
    .array(RecommendedActionSchema)
    .max(6)
    .describe("Ordered most urgent first. Omit anything the data does not support"),
});
export type CommandCenter = z.infer<typeof CommandCenterSchema>;

// ---------------------------------------------------------------- priority

export const PriorityExplanationSchema = z.object({
  explanation: z
    .string()
    .describe(
      "Two sentences at most, explaining the score using only the supplied signals",
    ),
});
export type PriorityExplanation = z.infer<typeof PriorityExplanationSchema>;

// ---------------------------------------------------------------- messages

export const MESSAGE_KINDS = [
  "FIRST_OUTREACH",
  "FOLLOW_UP",
  "REMINDER",
  "TIME_REQUEST",
  "CONFIRMATION",
  "RESCHEDULE",
  "CANCELLATION",
  "THANK_YOU",
] as const;

export const MessageKindSchema = z.enum(MESSAGE_KINDS);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export const DraftMessageSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP", "PHONE_SCRIPT"]),
  subject: z
    .string()
    .nullable()
    .describe("Subject line for email, null for other channels"),
  body: z.string().describe("The message itself, ready to send after review"),
  notes: z
    .string()
    .nullable()
    .describe("Anything the sender should check before sending, or null"),
});
export type DraftMessage = z.infer<typeof DraftMessageSchema>;

// ---------------------------------------------------------------- prep

export const MeetingPrepSchema = z.object({
  objectives: z
    .array(z.string())
    .max(5)
    .describe("Suggested goals for the meeting. These are suggestions, not facts"),
  talkingPoints: z.array(z.string()).max(6),
  questionsToAsk: z.array(z.string()).max(6),
  risks: z
    .array(z.string())
    .max(4)
    .describe("Things that could go wrong, based on the contact history supplied"),
  missingInformation: z
    .array(z.string())
    .max(4)
    .describe("What the system does not know and the user may want to fill in"),
});
export type MeetingPrep = z.infer<typeof MeetingPrepSchema>;

// ---------------------------------------------------------------- summary

export const SUMMARY_OUTCOMES = [
  "SUCCESS",
  "FOLLOW_UP_NEEDED",
  "NOT_RELEVANT",
  "POSTPONED",
  "ANOTHER_MEETING",
  "OTHER",
] as const;

export const ExtractedTaskSchema = z.object({
  description: z.string(),
  assigneeHint: z
    .string()
    .nullable()
    .describe("The name as written by the user, or null if unstated"),
  dueDateHint: z
    .string()
    .nullable()
    .describe("Date exactly as written, e.g. 'יום חמישי'. Do not invent a date"),
});
export type ExtractedTask = z.infer<typeof ExtractedTaskSchema>;

export const StructuredSummarySchema = z.object({
  summary: z.string().describe("A tidy paragraph built only from what the user wrote"),
  outcome: z.enum(SUMMARY_OUTCOMES),
  tasks: z.array(ExtractedTaskSchema).max(8),
  followUpRequired: z.boolean(),
  followUpInDays: z
    .number()
    .int()
    .nullable()
    .describe("Only when the user stated a timeframe. Otherwise null"),
});
export type StructuredSummary = z.infer<typeof StructuredSummarySchema>;

// ---------------------------------------------------------------- follow-up

export const FollowUpDetectionSchema = z.object({
  required: z.boolean(),
  inDays: z.number().int().nullable(),
  quote: z
    .string()
    .nullable()
    .describe("The exact words that led to this conclusion, or null"),
  suggestedSubject: z.string().nullable(),
});
export type FollowUpDetection = z.infer<typeof FollowUpDetectionSchema>;

// ---------------------------------------------------------------- stale

export const StaleRecommendationSchema = z.object({
  diagnosis: z.string().describe("One sentence on why this request looks stuck"),
  recommendedAction: z.enum([
    "SEND_FOLLOW_UP",
    "TRY_ANOTHER_CHANNEL",
    "ASK_EMPLOYEE_FOR_INFO",
    "PROPOSE_NEW_DATES",
    "CLOSE_AS_DECLINED",
    "NO_ACTION",
  ]),
  rationale: z.string(),
});
export type StaleRecommendation = z.infer<typeof StaleRecommendationSchema>;

// ---------------------------------------------------------------- duplicates

export const DuplicateVerdictSchema = z.object({
  candidates: z
    .array(
      z.object({
        requestNumber: z.number().int(),
        confidence: z.enum(["high", "medium", "low"]),
        reason: z.string(),
      }),
    )
    .max(5)
    .describe("Only requests from the supplied list. Never invent a number"),
});
export type DuplicateVerdict = z.infer<typeof DuplicateVerdictSchema>;

// ---------------------------------------------------------------- search

/**
 * Natural language search never produces SQL. The model fills in this filter,
 * the application validates it, and the tenant-scoped repository executes it.
 * Anything the model asks for that the user may not see is dropped by the
 * repository, not by the model.
 */
export const SearchFilterSchema = z.object({
  freeText: z.string().nullable(),
  statuses: z
    .array(
      z.enum([
        "NEW",
        "NEEDS_COORDINATION",
        "IN_PROGRESS",
        "WAITING_FOR_CONTACT",
        "WAITING_FOR_EMPLOYEE",
        "SCHEDULED",
        "RESCHEDULE_REQUESTED",
        "RESCHEDULED",
        "SUMMARY_REQUIRED",
        "COMPLETED",
        "CANCELLED",
        "DECLINED",
      ]),
    )
    .max(12),
  priorities: z.array(z.enum(["NORMAL", "HIGH", "URGENT"])).max(3),
  types: z.array(z.enum(["IN_PERSON", "PHONE", "VIDEO"])).max(3),
  requesterName: z.string().nullable(),
  coordinatorName: z.string().nullable(),
  departmentName: z.string().nullable(),
  company: z.string().nullable(),
  contactName: z.string().nullable(),
  createdWithinDays: z.number().int().nullable(),
  scheduledWithinDays: z.number().int().nullable(),
  openLongerThanDays: z.number().int().nullable(),
  noActivityForDays: z.number().int().nullable(),
  missingSummary: z.boolean(),
  overdueOnly: z.boolean(),
  unassignedOnly: z.boolean(),
  sortBy: z.enum(["CREATED", "PRIORITY", "OPEN_TIME", "SCHEDULED"]),
  limit: z.number().int().min(1).max(100),
  interpretation: z
    .string()
    .describe("One sentence restating the question as you understood it"),
});
export type SearchFilter = z.infer<typeof SearchFilterSchema>;

// ---------------------------------------------------------------- briefs

export const ManagerBriefSchema = z.object({
  period: z.string().describe("The window being reported, restated in words"),
  activity: z
    .array(z.string())
    .max(6)
    .describe("Plain sentences built only from the figures supplied"),
  attention: z.array(z.string()).max(5),
  trend: z.string().nullable().describe("Null when no comparison data was supplied"),
  recommendation: z.string(),
});
export type ManagerBrief = z.infer<typeof ManagerBriefSchema>;

export const DailyBriefSchema = z.object({
  headline: z.string(),
  lines: z.array(z.string()).max(6),
});
export type DailyBrief = z.infer<typeof DailyBriefSchema>;

// ---------------------------------------------------------------- intake

export const SmartIntakeSchema = z.object({
  contactFullName: z.string().nullable(),
  company: z.string().nullable(),
  jobTitle: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  subject: z.string().nullable(),
  purpose: z.string().nullable(),
  type: z.enum(["IN_PERSON", "PHONE", "VIDEO"]).nullable(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).nullable(),
  datePreferenceText: z
    .string()
    .nullable()
    .describe("The timing preference in the user's own words"),
  unparsed: z
    .array(z.string())
    .max(5)
    .describe("Parts of the text you could not place into a field"),
});
export type SmartIntake = z.infer<typeof SmartIntakeSchema>;

// ---------------------------------------------------------------- assistant

export const AssistantAnswerSchema = z.object({
  answer: z.string().describe("Answer only from the supplied data"),
  usedData: z.boolean().describe("False when the supplied data did not contain an answer"),
  links: z
    .array(
      z.object({
        label: z.string(),
        requestNumber: z.number().int(),
      }),
    )
    .max(8),
});
export type AssistantAnswer = z.infer<typeof AssistantAnswerSchema>;
