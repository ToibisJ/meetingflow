import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, PencilLine, Users } from "lucide-react";

import { Badge, Eyebrow, GlassCard, TextInput, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { formatMeetingSlot, meetingSlotParts } from "@/lib/dates";
import { groupByContact, meetingHistory } from "@/services/log/history";
import { LogAskBar } from "./ask-bar";

export const dynamic = "force-dynamic";

/**
 * The meeting log — every meeting that already happened, as far back as there
 * is a record.
 *
 * Grouped by person by default, because the question people actually bring here
 * is "have I sat with this one before, and how did it end".
 */

type Search = { q?: string; view?: string };

const SCOPE_NOTE = {
  ALL: "אתה רואה את כל הפגישות בארגון, מהפגישה הראשונה שנרשמה.",
  REPORTS: "אתה רואה את הפגישות שלך ושל האנשים שכפופים לך.",
  OWN: "אתה רואה את הפגישות שאתה פתחת או שהשתתפת בהן.",
} as const;

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const search = await searchParams;

  const { meetings, scope } = await meetingHistory(ctx.db, ctx.session, {
    q: search.q,
  });
  const contacts = groupByContact(meetings);
  const byTime = search.view === "time";

  const chip = (active: boolean) =>
    cn(
      "rounded-[999px] px-4 py-2 text-[13px] transition-colors",
      active
        ? "bg-[rgba(186,214,247,0.14)] text-frost-glow shadow-[inset_0_0_0_1px_rgba(186,215,247,0.24)]"
        : "bg-[rgba(186,214,247,0.06)] text-moon-mist shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:text-frost-glow",
    );

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.log")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          הפגישות שכבר היו
        </h1>
        <p className="max-w-[680px] text-[14px] leading-relaxed text-fog-veil">
          {SCOPE_NOTE[scope]} לפני שאתה נפגש עם מישהו, כאן אתה בודק אם כבר נפגשתם,
          מתי, מי היה, ומה יצא מזה.
        </p>
      </header>

      <LogAskBar />

      <GlassCard className="flex flex-wrap items-end justify-between gap-4 p-4">
        <form className="flex flex-wrap items-end gap-2">
          {byTime ? <input type="hidden" name="view" value="time" /> : null}
          <TextInput
            name="q"
            defaultValue={search.q ?? ""}
            placeholder="שם, חברה, נושא, טלפון או טקסט מתוך סיכום"
            className="min-w-[280px]"
          />
          <button
            type="submit"
            className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-5 py-2.5 text-[13px] text-frost-glow shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
          >
            {t("common.search")}
          </button>
          {search.q ? (
            <Link href={byTime ? "/log?view=time" : "/log"} className={chip(false)}>
              {t("common.clear")}
            </Link>
          ) : null}
        </form>

        <div className="flex flex-wrap gap-2">
          <Link
            href={search.q ? `/log?q=${encodeURIComponent(search.q)}` : "/log"}
            className={chip(!byTime)}
          >
            <span className="flex items-center gap-1.5">
              <Users size={14} />
              לפי איש קשר
            </span>
          </Link>
          <Link
            href={
              search.q
                ? `/log?view=time&q=${encodeURIComponent(search.q)}`
                : "/log?view=time"
            }
            className={chip(byTime)}
          >
            <span className="flex items-center gap-1.5">
              <CalendarClock size={14} />
              לפי תאריך
            </span>
          </Link>
        </div>
      </GlassCard>

      {meetings.length === 0 ? (
        <GlassCard>
          <p className="py-10 text-center text-[15px] text-fog-veil">
            {search.q
              ? "אין פגישה שמתאימה לחיפוש הזה."
              : "עוד לא נרשמה כאן אף פגישה שהתקיימה."}
          </p>
        </GlassCard>
      ) : byTime ? (
        /* ---------------------------------------------------------- by date */
        <GlassCard className="flex flex-col gap-1 p-4">
          <p className="px-2 pb-2 text-[13px] text-fog-veil">
            {meetings.length} פגישות, מהאחרונה לראשונה
          </p>
          {meetings.map((meeting) => {
            const when = meetingSlotParts(meeting.scheduledAt, locale);
            return (
              <Link
                key={meeting.id}
                href={`/requests/${meeting.requestNumber}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[6px] px-2 py-3 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
              >
                <span className="w-[190px] shrink-0">
                  <span className="block text-[13.5px] text-frost-glow">
                    {when.weekday}
                  </span>
                  <span className="block text-[12px] tabular-nums text-fog-veil">
                    {when.detail}
                  </span>
                </span>
                <span className="w-[170px] shrink-0">
                  <span className="block text-[13.5px] text-frost-glow">
                    {meeting.contact.fullName}
                  </span>
                  <span className="block text-[12px] text-fog-veil">
                    {meeting.contact.company ?? "—"}
                  </span>
                </span>
                <span className="min-w-[200px] flex-1 text-[13.5px] text-moon-mist">
                  {meeting.subject}
                </span>
                <span className="w-[140px] shrink-0 text-[12.5px] text-fog-veil">
                  {meeting.coordinatorName ?? "—"}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {meeting.corrections.length > 0 ? (
                    <Badge tone="warn">
                      <PencilLine size={12} />
                      תוקן
                    </Badge>
                  ) : null}
                  {meeting.summary ? (
                    <Badge tone={meeting.summary.tookPlace ? "ok" : "warn"}>
                      {t(`summaryOutcome.${meeting.summary.outcome}`)}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">אין סיכום</Badge>
                  )}
                </span>
              </Link>
            );
          })}
        </GlassCard>
      ) : (
        /* ------------------------------------------------------- by person */
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-fog-veil">
            {contacts.length} אנשי קשר, {meetings.length} פגישות
          </p>
          {contacts.map((entry) => (
            <GlassCard key={entry.contactId} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-[17px] font-medium text-ice-highlight">
                    {entry.contactName}
                  </h2>
                  <p className="text-[13px] text-fog-veil">
                    {entry.company ?? "ללא חברה"}
                    {entry.meetings[0].contact.jobTitle
                      ? ` · ${entry.meetings[0].contact.jobTitle}`
                      : ""}
                  </p>
                </div>
                <div className="text-end">
                  <Badge tone={entry.meetings.length > 1 ? "info" : "neutral"}>
                    {entry.meetings.length === 1
                      ? "פגישה אחת"
                      : `${entry.meetings.length} פגישות`}
                  </Badge>
                  <p className="pt-1.5 text-[12px] text-fog-veil">
                    אחרונה: {formatMeetingSlot(entry.lastMeetingAt, locale)}
                  </p>
                </div>
              </div>

              <ul className="flex flex-col gap-1 border-t border-[rgba(186,215,247,0.12)] pt-2">
                {entry.meetings.map((meeting) => (
                  <li key={meeting.id} className="flex flex-col">
                    <Link
                      href={`/requests/${meeting.requestNumber}`}
                      className="flex flex-col gap-1 rounded-[6px] px-2 py-2.5 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                    >
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[13px] tabular-nums text-frost-glow">
                          {formatMeetingSlot(meeting.scheduledAt, locale)}
                        </span>
                        <span className="text-[13.5px] text-moon-mist">
                          {meeting.subject}
                        </span>
                        {meeting.summary ? (
                          <Badge tone={meeting.summary.tookPlace ? "ok" : "warn"}>
                            {t(`summaryOutcome.${meeting.summary.outcome}`)}
                          </Badge>
                        ) : null}
                        {meeting.corrections.length > 0 ? (
                          <Badge tone="warn">
                            <PencilLine size={12} />
                            {meeting.corrections.length === 1
                              ? "תוקן"
                              : `תוקן ${meeting.corrections.length} פעמים`}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-[12px] text-fog-veil">
                        ביקש: {meeting.requesterName}
                        {meeting.coordinatorName
                          ? ` · תיאמה: ${meeting.coordinatorName}`
                          : ""}
                        {meeting.participants.length > 0
                          ? ` · השתתפו: ${meeting.participants.join(", ")}`
                          : ""}
                      </span>
                      {meeting.summary ? (
                        <span className="line-clamp-2 text-[12.5px] leading-relaxed text-fog-veil">
                          {meeting.summary.text}
                        </span>
                      ) : null}
                    </Link>

                    {/* Corrections are part of the record, so they are shown in
                        the log rather than hidden behind the request screen. */}
                    {meeting.corrections.length > 0 ? (
                      <ul className="mb-1 me-2 ms-2 flex flex-col gap-1.5 rounded-[6px] bg-[rgba(224,168,60,0.07)] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(224,168,60,0.2)]">
                        {meeting.corrections.map((correction, index) => (
                          <li key={index} className="flex flex-col gap-0.5">
                            <span className="text-[11.5px] text-[#e8c37a]">
                              תיקון · {formatMeetingSlot(correction.at, locale)}
                              {correction.by ? ` · ${correction.by}` : ""}
                            </span>
                            {correction.body ? (
                              <span className="whitespace-pre-line text-[12px] leading-relaxed text-moon-mist">
                                {correction.body}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
