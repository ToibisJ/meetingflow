import { Phone, Video } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { detectPlatform, joinHref } from "@/lib/meeting-platform";

/**
 * The way into a video meeting, shown wherever a meeting appears.
 *
 * It is a real link to the real meeting. Nothing here creates a Zoom or a Meet
 * room — the coordinator makes the room in the platform and pastes the link,
 * which is exactly what happens today without the software. What the product
 * adds is that the link then travels with the meeting: it is on the request, in
 * My Day, in the calendar and in the log, one click from wherever you are.
 */

export function MeetingLink({
  url,
  dialNumber,
  className,
  compact = false,
}: {
  url: string | null | undefined;
  dialNumber?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const platform = detectPlatform(url);

  if (!platform && !dialNumber) return null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {platform && url ? (
        <a
          href={joinHref(url)}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[999px] px-3 py-1.5 text-[12.5px] font-medium",
            "bg-[rgba(186,214,247,0.08)] text-frost-glow shadow-[inset_0_0_0_1px_rgba(186,215,247,0.16)]",
            "transition-colors hover:bg-[rgba(186,214,247,0.16)]",
            compact && "px-2.5 py-1 text-[12px]",
          )}
        >
          <span
            aria-hidden="true"
            className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: platform.tint }}
          />
          <Video size={13} className="shrink-0 opacity-70" />
          {compact ? platform.label : `הצטרף · ${platform.label}`}
        </a>
      ) : null}

      {dialNumber ? (
        <a
          href={`tel:${dialNumber.replace(/[^\d+]/g, "")}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[999px] px-3 py-1.5 text-[12.5px]",
            "bg-[rgba(186,214,247,0.06)] text-moon-mist shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
            "transition-colors hover:text-frost-glow",
            compact && "px-2.5 py-1 text-[12px]",
          )}
          dir="ltr"
        >
          <Phone size={12} className="shrink-0 opacity-70" />
          {dialNumber}
        </a>
      ) : null}
    </span>
  );
}
