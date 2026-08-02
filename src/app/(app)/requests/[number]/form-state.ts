/**
 * Shared shape for the workspace forms.
 *
 * It lives outside actions.ts on purpose: a "use server" module may only export
 * async functions, so a constant like IDLE cannot sit alongside the actions.
 */

export type FormState = { ok: boolean; message: string | null };

export const IDLE: FormState = { ok: false, message: null };
