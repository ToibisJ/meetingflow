"use server";

import { z } from "zod";

import { requireUser } from "@/lib/current-user";
import { runStructured } from "@/services/ai/gateway";
import { GUIDE } from "./content";
import type { AskState } from "./ask-state";

/**
 * "Ask George" — the question bar at the top of the guide.
 *
 * The answer is grounded in the guide itself and in nothing else. When no model
 * is configured the bar does not go quiet and does not invent an answer: it
 * falls back to searching the guide and pointing at the sections that match, and
 * says plainly that this is a search result rather than an answer.
 */

const AnswerSchema = z.object({
  answer: z.string().describe("Two to five sentences, in the user's language"),
  sectionIds: z
    .array(z.string())
    .max(3)
    .describe("Ids of the guide sections the answer came from"),
  answered: z
    .boolean()
    .describe("False when the guide does not contain an answer to the question"),
});

/** The whole guide as plain text, so the model can only speak from it. */
function guideAsText(): string {
  return GUIDE.flatMap((chapter) =>
    chapter.sections.map((section) => {
      const body = section.blocks
        .map((block) => {
          switch (block.type) {
            case "p":
              return block.text;
            case "list":
            case "steps":
              return block.items.map((item) => `- ${item}`).join("\n");
            case "note":
              return `${block.title}: ${block.text}`;
            case "table":
              return block.rows.map((row) => row.join(" | ")).join("\n");
            case "try":
              return block.text;
          }
        })
        .join("\n");

      return `### [${section.id}] ${chapter.title} › ${section.title}\n${section.summary}\n${body}`;
    }),
  ).join("\n\n");
}

/** Word-overlap search over the guide, used when no model is available. */
function searchGuide(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[?.,!"'׳״]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

  if (words.length === 0) return [];

  const scored = GUIDE.flatMap((chapter) =>
    chapter.sections.map((section) => {
      const haystack = `${section.title} ${section.summary} ${section.blocks
        .map((block) =>
          block.type === "list" || block.type === "steps"
            ? block.items.join(" ")
            : block.type === "table"
              ? block.rows.flat().join(" ")
              : block.type === "note"
                ? `${block.title} ${block.text}`
                : block.text,
        )
        .join(" ")}`.toLowerCase();

      const score = words.reduce(
        (total, word) => total + (haystack.includes(word) ? 1 : 0),
        0,
      );

      return { id: section.id, score };
    }),
  );

  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.id);
}

const ROLE = `אתה ג'ורג', העוזר של MeetingFlow. אתה עונה על שאלות של משתמשים על המערכת.

כללים:
- ענה אך ורק מתוך המדריך שמצורף לך. אל תמציא מסך, כפתור, שדה או התנהגות שלא מופיעים בו.
- אם המדריך לא מכיל תשובה, החזר answered=false ואמור זאת במפורש.
- ענה בעברית, בלשון זכר, בשתיים עד חמש שורות.
- החזר את המזהים של הפרקים שמהם התשובה הגיעה, כדי שהמשתמש יוכל לקפוץ אליהם.`;

export async function askGeorgeAction(
  _prev: AskState,
  form: FormData,
): Promise<AskState> {
  const question = String(form.get("question") ?? "").trim();

  if (!question) {
    return { status: "idle", answer: null, sectionIds: [], question: "" };
  }

  const ctx = await requireUser();

  // A preview session is read-only, and the gateway records usage as it goes.
  // Searching the guide is the honest thing to offer there.
  if (!ctx.preview) {
    const result = await runStructured(
      { db: ctx.db, session: ctx.session, plan: ctx.plan },
      {
        feature: "ASSISTANT_CHAT",
        permission: "request:read:own",
        system: ROLE,
        prompt: `--- המדריך ---\n${guideAsText()}\n--- סוף המדריך ---\n\nשאלה: ${question}`,
        schema: AnswerSchema,
        effort: "low",
        maxTokens: 6000,
        cacheSystem: true,
      },
    );

    if (result.ok) {
      return {
        status: result.value.answered ? "answered" : "not_in_guide",
        answer: result.value.answer,
        sectionIds: result.value.sectionIds,
        question,
      };
    }
  }

  // No model, no budget, or a refusal — fall back to honest search.
  const matches = searchGuide(question);

  return {
    status: matches.length > 0 ? "search" : "no_match",
    answer: null,
    sectionIds: matches,
    question,
  };
}
