import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge, EmptyState } from "@/components/ui/primitives";
import { meetingSlotParts } from "@/lib/dates";
import { computePriority } from "@/services/ai/priority";
import type {
  Priority,
  RequestStatus,
  SlaState,
} from "@/generated/prisma/enums";

/**
 * The work table.
 *
 * Rows are ranked by the computed priority score rather than by date, because
 * the question a coordinator is asking is "what first", not "what is newest".
 */

export type RequestRow = {
  id: string;
  requestNumber: number;
  subject: string;
  status: RequestStatus;
  priority: Priority;
  slaState: SlaState;
  createdAt: Date;
  lastActivityAt: Date;
  preferredDate: Date | null;
  scheduledAt: Date | null;
  contact: { fullName: string; company: string | null };
  requester: { fullName: string };
  coordinator: { fullName: string } | null;
  _count: { activities: number };
};

/** What the coordinator should do next, derived from the status alone. */
function nextActionKey(status: RequestStatus): string {
  switch (status) {
    case "NEW":
    case "NEEDS_COORDINATION":
      return "nextActionTake";
    case "IN_PROGRESS":
      return "nextActionContact";
    case "WAITING_FOR_CONTACT":
      return "nextActionRetry";
    case "RESCHEDULE_REQUESTED":
      return "nextActionSchedule";
    case "WAITING_FOR_EMPLOYEE":
      return "nextActionWaitEmployee";
    case "SUMMARY_REQUIRED":
      return "nextActionSummary";
    default:
      return "nextActionNone";
  }
}

export async function RequestTable({
  rows,
  showRequester = true,
}: {
  rows: RequestRow[];
  showRequester?: boolean;
}) {
  const t = await getTranslations();

  if (rows.length === 0) {
    return <EmptyState title={t("requests.empty")} hint={t("requests.emptyHint")} />;
  }

  const ranked = rows
    .map((row) => ({
      row,
      score: computePriority({
        priority: row.priority,
        status: row.status,
        slaState: row.slaState,
        createdAt: row.createdAt,
        lastActivityAt: row.lastActivityAt,
        preferredDate: row.preferredDate,
        scheduledAt: row.scheduledAt,
        contactAttempts: row._count.activities,
        replyReceived: false,
        companyRequestCount: 0,
      }),
    }))
    .sort((a, b) => b.score.score - a.score.score);

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-[13px]">
        <thead>
          <tr className="text-fog-veil">
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colNumber")}</th>
            {showRequester ? (
              <th className="px-2 pb-3 text-start font-normal">{t("requests.colRequester")}</th>
            ) : null}
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colContact")}</th>
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colSubject")}</th>
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colStatus")}</th>
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colCoordinator")}</th>
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colOpenFor")}</th>
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colScheduled")}</th>
            <th className="px-2 pb-3 text-start font-normal">{t("requests.colNextAction")}</th>
            <th className="px-2 pb-3 text-start font-normal">{t("request.priorityScore")}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ row, score }) => (
            <tr
              key={row.id}
              className="border-t border-[rgba(186,215,247,0.12)] transition-colors hover:bg-[rgba(186,214,247,0.045)]"
            >
              <td className="px-2 py-3">
                <Link
                  href={`/requests/${row.requestNumber}`}
                  className="tabular-nums text-frost-glow underline-offset-4 hover:underline"
                >
                  {row.requestNumber}
                </Link>
              </td>

              {showRequester ? (
                <td className="px-2 py-3 text-moon-mist">{row.requester.fullName}</td>
              ) : null}

              <td className="px-2 py-3">
                <span className="block text-frost-glow">{row.contact.fullName}</span>
                <span className="block text-[12px] text-fog-veil">
                  {row.contact.company ?? "—"}
                </span>
              </td>

              <td className="max-w-[220px] px-2 py-3">
                <Link
                  href={`/requests/${row.requestNumber}`}
                  className="block truncate text-moon-mist hover:text-frost-glow"
                >
                  {row.subject}
                </Link>
              </td>

              <td className="px-2 py-3">
                <Badge
                  tone={
                    row.slaState === "RED" ? "late" : row.slaState === "AMBER" ? "warn" : "neutral"
                  }
                >
                  {t(`status.${row.status}`)}
                </Badge>
              </td>

              <td className="px-2 py-3 text-moon-mist">
                {row.coordinator?.fullName ?? (
                  <span className="text-fog-veil">{t("common.unassigned")}</span>
                )}
              </td>

              <td className="px-2 py-3 tabular-nums text-moon-mist">
                {t("time.days", {
                  count: Math.floor((Date.now() - row.createdAt.getTime()) / 86_400_000),
                })}
              </td>

              <td className="px-2 py-3">
                {row.scheduledAt ? (
                  <>
                    <span className="block text-frost-glow">
                      {meetingSlotParts(row.scheduledAt).weekday}
                    </span>
                    <span className="block text-[12px] tabular-nums text-fog-veil">
                      {meetingSlotParts(row.scheduledAt).detail}
                    </span>
                  </>
                ) : (
                  <span className="text-fog-veil">{t("requests.notScheduledYet")}</span>
                )}
              </td>

              <td className="px-2 py-3 text-fog-veil">
                {t(`requests.${nextActionKey(row.status)}`)}
              </td>

              <td className="px-2 py-3">
                <Badge
                  tone={
                    score.band === "CRITICAL" ? "late" : score.band === "HIGH" ? "warn" : "neutral"
                  }
                >
                  {score.score}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const REQUEST_ROW_SELECT = {
  id: true,
  requestNumber: true,
  subject: true,
  status: true,
  priority: true,
  slaState: true,
  createdAt: true,
  lastActivityAt: true,
  preferredDate: true,
  scheduledAt: true,
  contact: { select: { fullName: true, company: true } },
  requester: { select: { fullName: true } },
  coordinator: { select: { fullName: true } },
  _count: { select: { activities: true } },
} as const;
