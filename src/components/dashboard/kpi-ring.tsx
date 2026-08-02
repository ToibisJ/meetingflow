import Link from "next/link";

import { cn } from "@/components/ui/primitives";

/**
 * A KPI tile. The ring encodes this metric's share of all open work, so the
 * six tiles read as one picture rather than six unrelated numbers.
 *
 * Clicking a tile filters the work list — the number and the list it opens are
 * always the same query.
 */

const TONES = {
  critical: { stroke: "#e05a4c", text: "text-[#f0a094]" },
  warning: { stroke: "#e0a83c", text: "text-[#e8c37a]" },
  info: { stroke: "#6ea8f0", text: "text-[#a8caf5]" },
  ok: { stroke: "#269684", text: "text-[#7fd7c6]" },
  neutral: { stroke: "#9da7ba", text: "text-moon-mist" },
} as const;

export type KpiTone = keyof typeof TONES;

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function KpiRing({
  label,
  value,
  total,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number;
  total: number;
  tone?: KpiTone;
  href: string;
}) {
  const share = total > 0 ? Math.min(1, value / total) : 0;
  const offset = CIRCUMFERENCE * (1 - share);
  const palette = TONES[tone];

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col items-center gap-3 rounded-[16px] p-5",
        "bg-[rgba(186,214,247,0.03)] transition-colors",
        "shadow-[inset_0_1px_1px_rgba(199,211,234,0.12),inset_0_24px_48px_rgba(199,211,234,0.05)]",
        "hover:bg-[rgba(186,214,247,0.06)]",
      )}
    >
      <span className="relative inline-flex h-[64px] w-[64px] items-center justify-center">
        <svg
          viewBox="0 0 64 64"
          className="absolute inset-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke="rgba(186,215,247,0.12)"
            strokeWidth="3"
          />
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke={palette.stroke}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms ease-out" }}
          />
        </svg>
        <span className={cn("text-[22px] font-medium tabular-nums", palette.text)}>
          {value}
        </span>
      </span>

      <span className="text-center text-[13px] leading-tight text-moon-mist">
        {label}
      </span>
    </Link>
  );
}
