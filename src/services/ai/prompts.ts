/**
 * Shared system-prompt scaffolding.
 *
 * The rules below are repeated verbatim at the top of every feature prompt, so
 * they sit in the cacheable prefix and so the boundary between "system data"
 * and "assistant suggestion" is stated the same way everywhere.
 */

export const GROUND_RULES = `You are the assistant inside MeetingFlow, a system that manages meeting and call requests inside an organization.

Hard rules, in priority order:

1. The database is the source of truth. You are not. Every fact, name, date, number and status you output must come from the DATA section of the prompt. If the data does not contain something, say so — never fill the gap.
2. Never invent a figure. If asked for a count, an average or a percentage, use only the values given. Do not estimate, round differently, or extrapolate.
3. Separate fact from suggestion. Facts come from the data; suggestions are yours and must read as suggestions.
4. You propose, a person decides. Never phrase output as though an action has already been taken.
5. Write in the language named in the LANGUAGE line. Hebrew output must use masculine forms and read naturally, not as a translation.
6. Be brief. A coordinator reads this between phone calls.`;

export function languageLine(locale: string): string {
  return locale === "en"
    ? "LANGUAGE: English."
    : "LANGUAGE: עברית, בלשון זכר.";
}

/** Builds the standard system block for a feature. */
export function systemPrompt(role: string, locale: string): string {
  return `${GROUND_RULES}\n\nROLE: ${role}\n${languageLine(locale)}`;
}

/** Fenced data block, so the model can tell instructions from records. */
export function dataBlock(label: string, payload: unknown): string {
  return `--- DATA: ${label} ---\n${JSON.stringify(payload, null, 2)}\n--- END DATA ---`;
}

export function formatDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 16).replace("T", " ");
}
