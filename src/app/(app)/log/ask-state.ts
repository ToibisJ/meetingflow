/**
 * Shape of the answer bar's state.
 *
 * `"use server"` files may only export async functions, so the idle value and
 * the type live here.
 */

export type LogAskState = {
  status: "idle" | "answered" | "not_found" | "search" | "no_match";
  answer: string | null;
  /** Request numbers the answer or the search points at. */
  requestNumbers: number[];
  question: string;
};

export const LOG_ASK_IDLE: LogAskState = {
  status: "idle",
  answer: null,
  requestNumbers: [],
  question: "",
};
