import type { AppLocale } from "@/i18n/config";

/**
 * Date formatting for the whole product.
 *
 * Meeting slots always spell out the weekday. A coordinator plans around
 * "which day is that" far more than around the numeric date, and leaving the
 * reader to work it out from 03.08 is exactly where scheduling mistakes start.
 */

const tag = (locale: string) => (locale === "en" ? "en-GB" : "he-IL");

/** Full slot: weekday, date, year and time. Used wherever a meeting is booked. */
export function formatMeetingSlot(value: Date, locale: AppLocale | string = "he"): string {
  const l = tag(locale);
  const weekday = value.toLocaleDateString(l, { weekday: "long" });
  const date = value.toLocaleDateString(l, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = value.toLocaleTimeString(l, { hour: "2-digit", minute: "2-digit" });
  return `${weekday}, ${date} · ${time}`;
}

/** Two lines for a table cell: the weekday, then the date and time under it. */
export function meetingSlotParts(
  value: Date,
  locale: AppLocale | string = "he",
): { weekday: string; detail: string } {
  const l = tag(locale);
  return {
    weekday: value.toLocaleDateString(l, { weekday: "long" }),
    detail: `${value.toLocaleDateString(l, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })} · ${value.toLocaleTimeString(l, { hour: "2-digit", minute: "2-digit" })}`,
  };
}

/** A date with no time — request opened, task due. */
export function formatDay(value: Date, locale: AppLocale | string = "he"): string {
  return value.toLocaleDateString(tag(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Dense timeline stamp: short weekday, short date, time. */
export function formatEventTime(value: Date, locale: AppLocale | string = "he"): string {
  const l = tag(locale);
  const weekday = value.toLocaleDateString(l, { weekday: "short" });
  const date = value.toLocaleDateString(l, { day: "2-digit", month: "2-digit" });
  const time = value.toLocaleTimeString(l, { hour: "2-digit", minute: "2-digit" });
  return `${weekday} ${date} · ${time}`;
}
