import type {
  Priority,
  RequestStatus,
  SlaState,
} from "@/generated/prisma/enums";

/**
 * Priority scoring.
 *
 * This is deliberately NOT a model call. The score decides what a coordinator
 * looks at first, so it has to be identical for identical inputs, cheap enough
 * to compute for every open request on every dashboard load, and explainable
 * down to the individual signal that produced it.
 *
 * The model's only role is optional: turning the factor list below into one
 * fluent sentence. It never invents a number and never changes the score.
 */

export type PriorityInput = {
  priority: Priority;
  status: RequestStatus;
  slaState: SlaState;
  createdAt: Date;
  lastActivityAt: Date;
  /** Earliest date the requester asked for, if any. */
  preferredDate: Date | null;
  /** When the meeting is actually booked, if it is. */
  scheduledAt: Date | null;
  contactAttempts: number;
  replyReceived: boolean;
  /** How many requests this organization has already made to the same company. */
  companyRequestCount: number;
  now?: Date;
};

/** A single contributor to the score, ready for translation in the UI. */
export type PriorityFactor = {
  /** Message key, resolved against the `priorityFactor` namespace. */
  key: string;
  /** Values interpolated into the message. */
  params: Record<string, number>;
  points: number;
};

export type PriorityBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PriorityResult = {
  score: number;
  band: PriorityBand;
  factors: PriorityFactor[];
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Statuses where nobody is waiting on anything. They score zero. */
const CLOSED: RequestStatus[] = ["COMPLETED", "CANCELLED", "DECLINED"];

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY);
}

function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / HOUR);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computePriority(input: PriorityInput): PriorityResult {
  const now = input.now ?? new Date();

  if (CLOSED.includes(input.status)) {
    return { score: 0, band: "LOW", factors: [] };
  }

  const factors: PriorityFactor[] = [];
  const add = (key: string, points: number, params: Record<string, number> = {}) => {
    const rounded = Math.round(points);
    if (rounded > 0) factors.push({ key, params, points: rounded });
  };

  // 1. What the requester asked for. Up to 25.
  const priorityPoints = { NORMAL: 4, HIGH: 15, URGENT: 25 }[input.priority];
  add("requesterPriority", priorityPoints);

  // 2. Age. Up to 15, saturating at two weeks.
  const ageDays = daysBetween(input.createdAt, now);
  add("openFor", clamp(ageDays * 1.1, 0, 15), { days: Math.floor(ageDays) });

  // 3. Silence. Up to 20 — the strongest single signal that something is stuck.
  const idleDays = daysBetween(input.lastActivityAt, now);
  add("noActivity", clamp((idleDays - 0.5) * 5, 0, 20), {
    days: Math.floor(idleDays),
  });

  // 4. The date the requester wanted is approaching. Up to 18.
  if (input.preferredDate && !input.scheduledAt) {
    const daysUntil = daysBetween(now, input.preferredDate);
    if (input.preferredDate.getTime() < now.getTime()) {
      add("desiredDatePassed", 18);
    } else if (daysUntil <= 10) {
      add("desiredDateNear", clamp(18 - daysUntil * 1.6, 0, 18), {
        days: Math.ceil(daysUntil),
      });
    }
  }

  // 5. A booked meeting is imminent. Up to 12.
  if (input.scheduledAt) {
    const hoursUntil = hoursBetween(now, input.scheduledAt);
    if (hoursUntil <= 48 && input.scheduledAt.getTime() >= now.getTime()) {
      add("meetingSoon", clamp(12 - hoursUntil / 5, 0, 12), {
        hours: Math.ceil(hoursUntil),
      });
    }
  }

  // 6. Repeated dead-end calls. Up to 12.
  if (input.contactAttempts >= 2 && !input.replyReceived) {
    add("attemptsWithoutReply", clamp((input.contactAttempts - 1) * 4, 0, 12), {
      count: input.contactAttempts,
    });
  }

  // 7. The organization already meets this company often. Up to 8.
  if (input.companyRequestCount >= 3) {
    add("keyAccount", clamp((input.companyRequestCount - 2) * 2.5, 0, 8), {
      count: input.companyRequestCount,
    });
  }

  // 8. Handling-time breach. Up to 15.
  if (input.slaState === "RED") add("slaBreached", 15);
  else if (input.slaState === "AMBER") add("slaAtRisk", 7);

  // 9. Nobody has picked it up yet. Up to 10.
  if (input.status === "NEW" || input.status === "NEEDS_COORDINATION") {
    add("awaitingCoordinator", clamp(ageDays * 6, 0, 10));
  }

  // 10. Blocked on the requester rather than on the desk. Up to 8.
  if (input.status === "WAITING_FOR_EMPLOYEE") {
    add("blockedOnEmployee", clamp(idleDays * 3, 0, 8), {
      days: Math.floor(idleDays),
    });
  }

  // 11. The meeting happened and nobody wrote it up. Up to 10.
  if (input.status === "SUMMARY_REQUIRED") {
    add("summaryOverdue", clamp(4 + idleDays * 3, 0, 10), {
      days: Math.floor(idleDays),
    });
  }

  const raw = factors.reduce((total, factor) => total + factor.points, 0);
  const score = clamp(Math.round(raw), 0, 100);

  const band: PriorityBand =
    score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";

  factors.sort((a, b) => b.points - a.points);

  return { score, band, factors };
}

/**
 * A plain-language explanation assembled from the factors alone. Used as-is
 * when no model is configured, and as the grounding text when one is.
 */
export function factorSummary(result: PriorityResult): string {
  return result.factors
    .slice(0, 4)
    .map((factor) => {
      const params = Object.entries(factor.params)
        .map(([name, value]) => `${name}=${value}`)
        .join(" ");
      return params ? `${factor.key}(${params}) +${factor.points}` : `${factor.key} +${factor.points}`;
    })
    .join(", ");
}
