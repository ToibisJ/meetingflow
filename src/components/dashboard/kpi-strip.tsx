import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { cn } from "@/components/ui/primitives";
import type { SessionUser } from "@/lib/session";
import type { TenantDb } from "@/lib/tenant";
import { dashboardSnapshot } from "@/services/dashboard/attention";

/**
 * The six counters, pinned under the top bar on every screen.
 *
 * They are the same six numbers for everybody and they never move, so a person
 * learns their positions once and afterwards reads them without looking. What
 * differs between people is the value, not the layout: the counts come from the
 * same visibility filter the lists use, so an employee sees his own picture and
 * a coordinator sees the desk's.
 *
 * Each one is a link to the list it counts. The number and the list it opens are
 * always the same query.
 */

const TONES = {
  critical: { stroke: "#e05a4c", text: "text-[#f0a094]" },
  warning: { stroke: "#e0a83c", text: "text-[#e8c37a]" },
  info: { stroke: "#6ea8f0", text: "text-[#a8caf5]" },
  ok: { stroke: "#269684", text: "text-[#7fd7c6]" },
  neutral: { stroke: "#9da7ba", text: "text-moon-mist" },
} as const;

type Tone = keyof typeof TONES;

const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export async function KpiStrip({
  db,
  session,
}: {
  db: TenantDb;
  session: SessionUser;
}) {
  const t = await getTranslations();
  const { counters } = await dashboardSnapshot(db, session);

  const total =
    counters.needsCoordination +
    counters.inProgress +
    counters.waiting +
    counters.scheduled +
    counters.completed;

  const tiles: { label: string; value: number; tone: Tone; href: string }[] = [
    {
      label: t("dashboard.kpiNeedsCoordination"),
      value: counters.needsCoordination,
      tone: "critical",
      href: "/requests?status=NEEDS_COORDINATION",
    },
    {
      label: t("dashboard.kpiInProgress"),
      value: counters.inProgress,
      tone: "info",
      href: "/requests?status=IN_PROGRESS",
    },
    {
      label: t("dashboard.kpiWaiting"),
      value: counters.waiting,
      tone: "warning",
      href: "/requests?status=WAITING_FOR_CONTACT",
    },
    {
      label: t("dashboard.kpiScheduled"),
      value: counters.scheduled,
      tone: "ok",
      href: "/requests?status=SCHEDULED",
    },
    {
      label: t("dashboard.kpiToday"),
      value: counters.today,
      tone: "info",
      href: "/requests?view=today",
    },
    {
      label: t("dashboard.kpiCompleted"),
      value: counters.completed,
      tone: "neutral",
      href: "/requests?status=COMPLETED",
    },
  ];

  return (
    <div className="border-b border-[rgba(186,215,247,0.12)] bg-[rgba(10,10,18,0.82)] backdrop-blur-xl">
      {/* Scrolls inside itself on a narrow screen so the page body never does. */}
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-1 overflow-x-auto px-[10px] py-1.5 lg:px-[18px]">
        {tiles.map((tile) => {
          const share = total > 0 ? Math.min(1, tile.value / total) : 0;
          const palette = TONES[tile.tone];

          return (
            <Link
              key={tile.label}
              href={tile.href}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 transition-colors",
                "hover:bg-[rgba(186,214,247,0.06)]",
                "focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.4)]",
              )}
            >
              <span className="relative inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center">
                <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden="true">
                  <circle
                    cx="16"
                    cy="16"
                    r={RADIUS}
                    fill="none"
                    stroke="rgba(186,215,247,0.12)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="16"
                    cy="16"
                    r={RADIUS}
                    fill="none"
                    stroke={palette.stroke}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE * (1 - share)}
                    style={{ transition: "stroke-dashoffset 700ms ease-out" }}
                  />
                </svg>
                <span
                  className={cn(
                    "text-[12.5px] font-medium tabular-nums leading-none",
                    palette.text,
                  )}
                >
                  {tile.value}
                </span>
              </span>
              <span className="whitespace-nowrap text-[12.5px] leading-tight text-moon-mist">
                {tile.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
