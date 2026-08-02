import "server-only";

import { SmartIntakeSchema, type SmartIntake } from "./schemas";
import { systemPrompt } from "./prompts";
import { runStructured, type AiCallResult, type AiContext } from "./gateway";

/**
 * Free-text intake on the new-request form.
 *
 * The employee writes a sentence; the model proposes field values. Nothing is
 * saved — the parsed values pre-fill the form and the employee confirms or
 * corrects them before submitting.
 */

const ROLE = `You read one or two sentences describing a meeting someone wants arranged, and you fill in a request form from it.

Rules for this form:
- Copy values from the text. Do not normalise names, do not guess a company from a person's name, and do not infer an email address.
- Leave a field null whenever the text does not state it. A half-guess costs the user more time than an empty field.
- datePreferenceText holds the timing exactly as the person expressed it, in their words. Never convert it to a calendar date.
- Put anything you could not place into a field into unparsed, so the interface can show it to the user.`;

export async function parseIntake(
  ctx: AiContext,
  text: string,
): Promise<AiCallResult<SmartIntake>> {
  return runStructured(ctx, {
    feature: "SMART_INTAKE",
    permission: "request:create",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt: `--- WHAT THE EMPLOYEE TYPED ---\n${text}\n--- END ---`,
    schema: SmartIntakeSchema,
    effort: "low",
    maxTokens: 5000,
    cacheSystem: true,
  });
}
