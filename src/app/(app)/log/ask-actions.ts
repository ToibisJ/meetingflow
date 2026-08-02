"use server";

import { z } from "zod";

import { requireUser } from "@/lib/current-user";
import { formatMeetingSlot } from "@/lib/dates";
import { runStructured } from "@/services/ai/gateway";
import { meetingHistory } from "@/services/log/history";
import type { LogAskState } from "./ask-state";

/**
 * Asking George about your own meeting history.
 *
 * Two things make this safe to offer to everybody. First, the log handed to the
 * model is the one this person is allowed to see and nothing more — the same
 * visibility filter the screen itself uses. Second, when no model is available
 * the bar does not invent an answer: it searches the log and says so.
 */

const AnswerSchema = z.object({
  answer: z.string().describe("Two to five sentences, in the user's language"),
  requestNumbers: z
    .array(z.number())
    .max(5)
    .describe("Request numbers the answer is based on"),
  found: z.boolean().describe("False when the log contains nothing about the question"),
});

const ROLE = `אתה ג'ורג', העוזר של MeetingFlow. אתה עונה על שאלות לגבי פגישות שכבר התקיימו.

כללים:
- ענה אך ורק מתוך הלוג שמצורף לך. אל תמציא פגישה, אדם, תאריך או תוצאה.
- אם הלוג לא מכיל את התשובה, החזר found=false ואמור זאת במפורש.
- ענה בעברית, בלשון זכר, בשתיים עד חמש שורות.
- החזר את מספרי הבקשות שעליהם התשובה נשענת.`;

/** Word overlap over the log, used when no model is available. */
function searchLog(
  question: string,
  rows: { requestNumber: number; haystack: string }[],
): number[] {
  const words = question
    .toLowerCase()
    .replace(/[?.,!"'׳״]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

  if (words.length === 0) return [];

  return rows
    .map((row) => {
      const haystack = row.haystack.toLowerCase();
      const score = words.reduce(
        (total, word) => total + (haystack.includes(word) ? 1 : 0),
        0,
      );
      return { requestNumber: row.requestNumber, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.requestNumber);
}

export async function askLogAction(
  _prev: LogAskState,
  form: FormData,
): Promise<LogAskState> {
  const question = String(form.get("question") ?? "").trim();

  if (!question) {
    return { status: "idle", answer: null, requestNumbers: [], question: "" };
  }

  const ctx = await requireUser();
  const { meetings } = await meetingHistory(ctx.db, ctx.session, { limit: 200 });

  const lines = meetings.map((meeting) => ({
    requestNumber: meeting.requestNumber,
    haystack: [
      `בקשה ${meeting.requestNumber}`,
      formatMeetingSlot(meeting.scheduledAt, ctx.session.locale),
      meeting.contact.fullName,
      meeting.contact.company ?? "",
      meeting.subject,
      meeting.purpose ?? "",
      meeting.requesterName,
      meeting.coordinatorName ?? "",
      meeting.participants.join(", "),
      meeting.summary?.text ?? "",
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  // A preview session is read-only, and the gateway records usage. Searching is
  // the honest thing to offer there rather than failing on a write.
  if (!ctx.preview && lines.length > 0) {
    const result = await runStructured(
      { db: ctx.db, session: ctx.session, plan: ctx.plan },
      {
        feature: "ASSISTANT_CHAT",
        permission: "log:read:own",
        system: ROLE,
        prompt: `--- לוג הפגישות ---\n${lines
          .map((line) => line.haystack)
          .join("\n")}\n--- סוף הלוג ---\n\nשאלה: ${question}`,
        schema: AnswerSchema,
        effort: "low",
        maxTokens: 6000,
      },
    );

    if (result.ok) {
      return {
        status: result.value.found ? "answered" : "not_found",
        answer: result.value.answer,
        requestNumbers: result.value.requestNumbers,
        question,
      };
    }
  }

  const matches = searchLog(question, lines);

  return {
    status: matches.length > 0 ? "search" : "no_match",
    answer: null,
    requestNumbers: matches,
    question,
  };
}
