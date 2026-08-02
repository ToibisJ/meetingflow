import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight, Mail, MessageCircle, Phone } from "lucide-react";

import { MeetingLink } from "@/components/meeting-link";
import { Badge, Eyebrow, GlassCard, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { allowedTransitions } from "@/lib/workflow";
import { formatDay, formatEventTime, formatMeetingSlot } from "@/lib/dates";
import { computePriority } from "@/services/ai/priority";
import { requestVisibility } from "@/services/requests/visibility";
import { ActionPanel, type ActionKey } from "./action-panel";

export const dynamic = "force-dynamic";

/** Digits only, so a phone number becomes a dialable and WhatsApp-able link. */
function digits(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\D/g, "");
  return cleaned.length >= 7 ? cleaned : null;
}

/** Israeli local numbers need the country code before WhatsApp will accept them. */
function toInternational(value: string | null): string | null {
  const cleaned = digits(value);
  if (!cleaned) return null;
  if (cleaned.startsWith("972")) return cleaned;
  if (cleaned.startsWith("0")) return `972${cleaned.slice(1)}`;
  return cleaned;
}

function fmtDateTime(value: Date | null): string | null {
  return value ? formatEventTime(value) : null;
}

function fmtSlot(value: Date | null): string | null {
  return value ? formatMeetingSlot(value) : null;
}

export default async function RequestWorkspace({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const requestNumber = Number(number);

  if (!Number.isInteger(requestNumber)) notFound();

  const ctx = await requireUser();
  const t = await getTranslations();

  // The visibility filter is applied to the lookup itself, so a request the
  // user may not see is indistinguishable from one that does not exist.
  const visible = await requestVisibility(ctx.db, ctx.session);

  const request = await ctx.db.meetingRequest.findFirst({
    where: { AND: [visible, { requestNumber }] },
    select: {
      id: true,
      requestNumber: true,
      subject: true,
      purpose: true,
      description: true,
      desiredOutcome: true,
      type: true,
      priority: true,
      status: true,
      slaState: true,
      createdAt: true,
      lastActivityAt: true,
      preferredDate: true,
      preferredTime: true,
      rangeStart: true,
      rangeEnd: true,
      scheduledAt: true,
      hadPriorContact: true,
      priorContactBy: true,
      priorContactNotes: true,
      requesterUserId: true,
      assignedCoordinatorId: true,
      contact: {
        select: {
          fullName: true,
          company: true,
          jobTitle: true,
          phone: true,
          phoneAlt: true,
          email: true,
          website: true,
          linkedin: true,
          notes: true,
        },
      },
      requester: { select: { id: true, fullName: true, email: true, phone: true } },
      coordinator: { select: { id: true, fullName: true } },
      participants: {
        select: { user: { select: { id: true, fullName: true } } },
      },
      dateOptions: {
        select: { optionDate: true, optionTime: true },
        orderBy: { rank: "asc" },
      },
      meetings: {
        select: {
          scheduledStart: true,
          scheduledEnd: true,
          location: true,
          meetingUrl: true,
          dialNumber: true,
          status: true,
        },
        orderBy: { scheduledStart: "desc" },
      },
      summaries: {
        select: {
          summary: true,
          outcome: true,
          tookPlace: true,
          submittedAt: true,
          submittedBy: { select: { fullName: true } },
        },
        orderBy: { submittedAt: "desc" },
      },
      tasks: {
        select: {
          id: true,
          description: true,
          dueDate: true,
          status: true,
          assignee: { select: { fullName: true } },
        },
      },
      activities: {
        select: {
          id: true,
          type: true,
          channel: true,
          outcome: true,
          body: true,
          occurredAt: true,
          actor: { select: { fullName: true } },
        },
        orderBy: { occurredAt: "asc" },
      },
    },
  });

  if (!request) notFound();

  const attempts = request.activities.filter(
    (activity) => activity.type === "CONTACT_ATTEMPT",
  ).length;

  const score = computePriority({
    priority: request.priority,
    status: request.status,
    slaState: request.slaState,
    createdAt: request.createdAt,
    lastActivityAt: request.lastActivityAt,
    preferredDate: request.preferredDate,
    scheduledAt: request.scheduledAt,
    contactAttempts: attempts,
    replyReceived: request.activities.some((a) => a.type === "REPLY_RECEIVED"),
    companyRequestCount: 0,
  });

  // Which actions to offer: the legal transitions from here, filtered by the
  // permissions this user actually holds, plus the always-available ones.
  const legal = allowedTransitions(request.status);
  const isMine = request.requesterUserId === ctx.session.id;
  const coordinates = can(ctx.session.role, "request:read:all");

  const available: ActionKey[] = [];

  if (coordinates) {
    if (!request.assignedCoordinatorId && can(ctx.session.role, "request:take")) {
      available.push("take");
    }
    if (can(ctx.session.role, "request:assign")) available.push("assign");
    if (can(ctx.session.role, "request:logActivity")) {
      available.push("logAttempt", "reply");
    }
    if (legal.some((rule) => rule.to === "SCHEDULED")) available.push("schedule");
    if (legal.some((rule) => rule.to === "RESCHEDULED")) available.push("reschedule");
    if (legal.some((rule) => rule.to === "WAITING_FOR_EMPLOYEE")) {
      available.push("requestInfo");
    }
    if (legal.some((rule) => rule.to === "DECLINED")) available.push("decline");
  }

  if (request.status === "WAITING_FOR_EMPLOYEE" && (isMine || coordinates)) {
    available.push("provideInfo");
  }

  if (legal.some((rule) => rule.to === "RESCHEDULE_REQUESTED") && (isMine || coordinates)) {
    available.push("requestReschedule");
  }

  if (request.status === "SUMMARY_REQUIRED" && (isMine || coordinates)) {
    available.push("summary");
  }

  if (isMine || coordinates) available.push("note");

  // A correction has nothing to do with the state machine — a record can be
  // wrong at any stage, including long after the meeting is over.
  if (can(ctx.session.role, "request:correct") && (isMine || coordinates)) {
    available.push("correct");
  }

  if (legal.some((rule) => rule.to === "CANCELLED") && (isMine || coordinates)) {
    available.push("cancel");
  }

  const [coordinators, colleagues] = await Promise.all([
    ctx.db.user.findMany({
      where: { role: { in: ["COORDINATOR", "ADMIN", "MANAGER"] }, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    ctx.db.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const phone = toInternational(request.contact.phone);
  const nextMeeting = request.meetings[0] ?? null;

  const slaTone =
    request.slaState === "RED" ? "late" : request.slaState === "AMBER" ? "warn" : "neutral";

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/requests"
          className="inline-flex w-fit items-center gap-1 text-[13px] text-fog-veil hover:text-frost-glow"
        >
          <ChevronRight size={14} className="rtl:rotate-0 ltr:rotate-180" />
          {t("request.backToList")}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>{t("request.title", { number: request.requestNumber })}</Eyebrow>
          <Badge tone={slaTone}>{t(`status.${request.status}`)}</Badge>
          <Badge tone={request.priority === "URGENT" ? "late" : request.priority === "HIGH" ? "warn" : "neutral"}>
            {t(`priority.${request.priority}`)}
          </Badge>
          <Badge>{t(`meetingType.${request.type}`)}</Badge>
          <Badge tone={score.band === "CRITICAL" ? "late" : score.band === "HIGH" ? "warn" : "neutral"}>
            {t("request.priorityScore")} {score.score}
          </Badge>
        </div>

        <h1 className="text-[28px] font-medium leading-tight text-ice-highlight">
          {request.subject}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ------------------------------------------------ details column */}
        <div className="flex flex-col gap-6">
          <GlassCard className="flex flex-col gap-5">
            <h2 className="text-[17px] font-medium text-ice-highlight">
              {t("request.contactCard")}
            </h2>

            <div>
              <p className="text-[16px] text-frost-glow">{request.contact.fullName}</p>
              <p className="text-[13px] text-fog-veil">
                {[request.contact.jobTitle, request.contact.company]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>

            {/* One tap from the workspace to the actual conversation. */}
            <div className="flex flex-wrap gap-2">
              {request.contact.phone ? (
                <a
                  href={`tel:${digits(request.contact.phone)}`}
                  className="inline-flex items-center gap-2 rounded-[999px] bg-[rgba(186,214,247,0.06)] px-4 py-2 text-[13px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
                >
                  <Phone size={14} />
                  {request.contact.phone}
                </a>
              ) : null}

              {phone ? (
                <a
                  href={`https://wa.me/${phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[999px] bg-[rgba(38,150,132,0.16)] px-4 py-2 text-[13px] text-[#7fd7c6] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(38,150,132,0.24)]"
                >
                  <MessageCircle size={14} />
                  {t("request.whatsapp")}
                </a>
              ) : null}

              {request.contact.email ? (
                <a
                  href={`mailto:${request.contact.email}?subject=${encodeURIComponent(request.subject)}`}
                  className="inline-flex items-center gap-2 rounded-[999px] bg-[rgba(186,214,247,0.06)] px-4 py-2 text-[13px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
                >
                  <Mail size={14} />
                  {request.contact.email}
                </a>
              ) : null}
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label={t("newRequest.phoneAlt")} value={request.contact.phoneAlt} />
              <Fact label={t("newRequest.website")} value={request.contact.website} />
              <Fact label={t("newRequest.linkedin")} value={request.contact.linkedin} />
              <Fact label={t("newRequest.notes")} value={request.contact.notes} />
            </dl>
          </GlassCard>

          <GlassCard className="flex flex-col gap-5">
            <h2 className="text-[17px] font-medium text-ice-highlight">
              {t("request.detailsTitle")}
            </h2>

            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label={t("request.requestedBy")} value={request.requester.fullName} />
              <Fact
                label={t("request.handledBy")}
                value={request.coordinator?.fullName ?? t("common.unassigned")}
              />
              <Fact label={t("newRequest.purpose")} value={request.purpose} />
              <Fact label={t("newRequest.desiredOutcome")} value={request.desiredOutcome} />
              <Fact
                label={t("request.openFor")}
                value={t("time.days", {
                  count: Math.floor((Date.now() - request.createdAt.getTime()) / 86_400_000),
                })}
              />
              <Fact
                label={t("request.scheduledFor")}
                value={fmtSlot(request.scheduledAt)}
              />
              <Fact
                label={t("newRequest.preferredDate")}
                value={
                  request.preferredDate
                    ? `${formatDay(request.preferredDate)}${request.preferredTime ? ` · ${request.preferredTime}` : ""}`
                    : null
                }
              />
              <Fact
                label={t("request.participants")}
                value={request.participants.map((p) => p.user.fullName).join(", ")}
              />
            </dl>

            {request.description ? (
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.1em] text-fog-veil" style={{ fontFamily: "var(--font-dotdigital)" }}>
                  {t("newRequest.description")}
                </p>
                <p className="text-[14px] leading-relaxed text-moon-mist">
                  {request.description}
                </p>
              </div>
            ) : null}

            {request.dateOptions.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.1em] text-fog-veil" style={{ fontFamily: "var(--font-dotdigital)" }}>
                  {t("newRequest.dateModeOptions")}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {request.dateOptions.map((option, index) => (
                    <li key={index}>
                      <Badge>
                        {formatDay(option.optionDate)}
                        {option.optionTime ? ` · ${option.optionTime}` : ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </GlassCard>

          <GlassCard className="flex flex-col gap-3">
            <h2 className="text-[17px] font-medium text-ice-highlight">
              {t("request.whyUrgent")}
            </h2>

            {score.factors.length === 0 ? (
              <p className="text-[14px] text-fog-veil">{t("request.notRanked")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {score.factors.map((factor) => (
                  <li key={factor.key} className="flex items-baseline gap-3 text-[14px] text-moon-mist">
                    <span className="min-w-[34px] text-end text-[12px] font-medium tabular-nums text-[#c0acff]">
                      +{factor.points}
                    </span>
                    <span>{t(`priorityFactor.${factor.key}`, factor.params)}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {request.summaries.length > 0 ? (
            <GlassCard className="flex flex-col gap-3">
              <h2 className="text-[17px] font-medium text-ice-highlight">
                {t("summary.title")}
              </h2>
              {request.summaries.map((summary, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={summary.tookPlace ? "ok" : "warn"}>
                      {summary.tookPlace ? t("common.yes") : t("common.no")}
                    </Badge>
                    <Badge>{t(`summaryOutcome.${summary.outcome}`)}</Badge>
                    <span className="text-[12px] text-fog-veil">
                      {summary.submittedBy?.fullName} · {fmtDateTime(summary.submittedAt)}
                    </span>
                  </div>
                  <p className="text-[14px] leading-relaxed text-moon-mist">
                    {summary.summary}
                  </p>
                </div>
              ))}
            </GlassCard>
          ) : null}

          {request.tasks.length > 0 ? (
            <GlassCard className="flex flex-col gap-3">
              <h2 className="text-[17px] font-medium text-ice-highlight">
                {t("summary.tasks")}
              </h2>
              <ul className="flex flex-col gap-2">
                {request.tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-2 text-[14px] text-moon-mist">
                    <Badge tone={task.status === "DONE" ? "ok" : "neutral"}>
                      {task.status === "DONE" ? t("common.yes") : t("common.no")}
                    </Badge>
                    <span className="flex-1">{task.description}</span>
                    {task.assignee ? (
                      <span className="text-[12px] text-fog-veil">{task.assignee.fullName}</span>
                    ) : null}
                    {task.dueDate ? (
                      <span className="text-[12px] text-fog-veil">
                        {formatDay(task.dueDate)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </GlassCard>
          ) : null}
        </div>

        {/* ----------------------------------------------- working column */}
        <div className="flex flex-col gap-6">
          <GlassCard className="flex flex-col gap-4">
            <div>
              <h2 className="text-[17px] font-medium text-ice-highlight">
                {t("request.actionsTitle")}
              </h2>
              <p className="text-[12px] text-fog-veil">{t("request.actionsHint")}</p>
            </div>

            <ActionPanel
              requestId={request.id}
              available={available}
              coordinators={coordinators}
              colleagues={colleagues}
            />
          </GlassCard>

          {nextMeeting ? (
            <GlassCard className="flex flex-col gap-2">
              <h2 className="text-[17px] font-medium text-ice-highlight">
                {t("request.scheduledFor")}
              </h2>
              <p className="text-[16px] text-frost-glow">
                {fmtSlot(nextMeeting.scheduledStart)}
              </p>
              {nextMeeting.location ? (
                <p className="text-[13px] text-fog-veil">{nextMeeting.location}</p>
              ) : null}
              <MeetingLink
                url={nextMeeting.meetingUrl}
                dialNumber={nextMeeting.dialNumber}
                className="pt-1"
              />
              {!nextMeeting.location && !nextMeeting.meetingUrl && !nextMeeting.dialNumber ? (
                <p className="text-[13px] text-fog-veil">—</p>
              ) : null}
            </GlassCard>
          ) : null}

          <GlassCard className="flex flex-col gap-4">
            <h2 className="text-[17px] font-medium text-ice-highlight">
              {t("request.timelineTitle")}
            </h2>

            {request.activities.length === 0 ? (
              <p className="text-[14px] text-fog-veil">{t("request.timelineEmpty")}</p>
            ) : (
              <ol className="relative flex flex-col">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 start-[5px] w-px bg-[rgba(186,215,247,0.12)]"
                />
                {request.activities.map((activity) => {
                  const isAi = activity.type.startsWith("AI_");
                  const isKey = ["SCHEDULED", "REPLY_RECEIVED", "RESCHEDULED", "COMPLETED"].includes(
                    activity.type,
                  );

                  const details = [
                    activity.channel ? t(`channel.${activity.channel}`) : null,
                    activity.outcome ? t(`outcome.${activity.outcome}`) : null,
                    activity.body,
                  ].filter(Boolean);

                  return (
                    <li key={activity.id} className="relative py-2.5 ps-6">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute start-[1px] top-[15px] h-2.5 w-2.5 rounded-full bg-midnight-canvas",
                          "shadow-[0_0_0_1px_rgba(186,215,247,0.12)]",
                          isAi && "bg-void-violet shadow-[0_0_0_3px_rgba(102,58,243,0.2)]",
                          isKey && "bg-[#6ea8f0] shadow-[0_0_0_3px_rgba(110,168,240,0.16)]",
                        )}
                      />
                      <time
                        className="block text-[11px] tabular-nums text-fog-veil"
                        style={{ fontFamily: "var(--font-dotdigital)" }}
                      >
                        {fmtDateTime(activity.occurredAt)}
                      </time>
                      <p className="text-[13.5px] text-moon-mist">
                        {t(`activity.${activity.type}`, {
                          actor: activity.actor?.fullName ?? t("common.system"),
                        })}
                      </p>
                      {details.length > 0 ? (
                        <p className="text-[12.5px] text-fog-veil">{details.join(" · ")}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt
        className="text-[11px] uppercase tracking-[0.1em] text-fog-veil"
        style={{ fontFamily: "var(--font-dotdigital)" }}
      >
        {label}
      </dt>
      <dd className="m-0 text-[14px] text-moon-mist">{value || "—"}</dd>
    </div>
  );
}
