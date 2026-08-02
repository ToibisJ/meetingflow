"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import {
  Button,
  ErrorNote,
  Field,
  TextInput,
  cn,
} from "@/components/ui/primitives";
import { IDLE, type FormState } from "./form-state";
import {
  assignAction,
  cancelAction,
  declineAction,
  logAttemptAction,
  noteAction,
  provideInfoAction,
  replyAction,
  requestInfoAction,
  requestRescheduleAction,
  rescheduleAction,
  scheduleAction,
  summaryAction,
  takeAction,
} from "./actions";

/**
 * The panel where a coordinator does the work.
 *
 * Which actions appear is decided on the server and passed in as `available`,
 * so this component never has to reason about the state machine. Each action is
 * a disclosure: the button opens its form, and the form closes on success.
 */

export type ActionKey =
  | "take"
  | "assign"
  | "logAttempt"
  | "reply"
  | "note"
  | "schedule"
  | "reschedule"
  | "requestInfo"
  | "provideInfo"
  | "requestReschedule"
  | "decline"
  | "cancel"
  | "summary";

export type Coordinator = { id: string; fullName: string };
export type Colleague = { id: string; fullName: string };

type Props = {
  requestId: string;
  available: ActionKey[];
  coordinators: Coordinator[];
  colleagues: Colleague[];
  defaultDuration?: number;
};

const CHANNELS = ["PHONE", "EMAIL", "WHATSAPP", "SMS", "LINKEDIN", "OTHER"] as const;
const ATTEMPT_OUTCOMES = [
  "NO_ANSWER",
  "LEFT_MESSAGE",
  "ANSWERED",
  "BOUNCED",
  "POSITIVE",
  "NEGATIVE",
] as const;
const SUMMARY_OUTCOMES = [
  "SUCCESS",
  "FOLLOW_UP_NEEDED",
  "NOT_RELEVANT",
  "POSTPONED",
  "ANOTHER_MEETING",
  "OTHER",
] as const;

const selectClass = cn(
  "w-full rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[14px] text-pure-white",
  "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] focus:outline-none",
  "focus:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.24)]",
);

const areaClass = cn(
  "w-full rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[14px] text-pure-white",
  "placeholder:text-[rgba(199,211,234,0.5)] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
  "focus:outline-none focus:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.24)] min-h-[84px] resize-y",
);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** One collapsible action with its own form state. */
function Action({
  id,
  label,
  openId,
  setOpenId,
  action,
  requestId,
  children,
  submitLabel,
}: {
  id: ActionKey;
  label: string;
  openId: ActionKey | null;
  setOpenId: (next: ActionKey | null) => void;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  requestId: string;
  children?: React.ReactNode;
  submitLabel?: string;
}) {
  const t = useTranslations("request");
  const [state, formAction, pending] = useActionState(action, IDLE);
  const open = openId === id;

  // A successful submit collapses the form; the page revalidates behind it.
  if (state.ok && open) {
    queueMicrotask(() => setOpenId(null));
  }

  return (
    <div className="rounded-[10px] bg-[rgba(186,214,247,0.03)] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]">
      <button
        type="button"
        onClick={() => setOpenId(open ? null : id)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-3 text-start",
          "text-[14px] text-frost-glow transition-colors hover:bg-[rgba(186,214,247,0.06)]",
          open && "rounded-b-none",
        )}
      >
        <span>{label}</span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <form action={formAction} className="flex flex-col gap-3 border-t border-[rgba(186,215,247,0.12)] p-4">
          <input type="hidden" name="requestId" value={requestId} />
          {state.message ? <ErrorNote>{state.message}</ErrorNote> : null}
          {children}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? t("submitting") : (submitLabel ?? t("submit"))}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpenId(null)}>
              {t("close")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function ActionPanel({
  requestId,
  available,
  coordinators,
  colleagues,
  defaultDuration = 60,
}: Props) {
  // Every dictionary this panel needs, resolved once at the top — hooks cannot
  // be called inside the conditional blocks below.
  const t = useTranslations("request");
  const tc = useTranslations("channel");
  const to = useTranslations("outcome");
  const tso = useTranslations("summaryOutcome");
  const ts = useTranslations("summary");
  const tcommon = useTranslations("common");

  const [openId, setOpenId] = useState<ActionKey | null>(null);
  const [taskCount, setTaskCount] = useState(1);

  const has = (key: ActionKey) => available.includes(key);
  const shared = { openId, setOpenId, requestId };

  if (available.length === 0) {
    return <p className="text-[14px] text-fog-veil">{t("noActions")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {has("take") ? (
        <Action {...shared} id="take" label={t("actionTake")} action={takeAction} submitLabel={t("actionTake")}>
          <p className="text-[13px] text-fog-veil">{t("actionsHint")}</p>
        </Action>
      ) : null}

      {has("assign") ? (
        <Action {...shared} id="assign" label={t("actionAssign")} action={assignAction}>
          <Field label={t("selectCoordinator")}>
            <select name="coordinatorId" className={selectClass} required>
              <option value="">—</option>
              {coordinators.map((coordinator) => (
                <option key={coordinator.id} value={coordinator.id}>
                  {coordinator.fullName}
                </option>
              ))}
            </select>
          </Field>
        </Action>
      ) : null}

      {has("logAttempt") ? (
        <Action {...shared} id="logAttempt" label={t("actionLogAttempt")} action={logAttemptAction}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("attemptChannel")}>
              <select name="channel" className={selectClass} defaultValue="PHONE">
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {tc(channel)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("attemptOutcome")}>
              <select name="outcome" className={selectClass} defaultValue="NO_ANSWER">
                {ATTEMPT_OUTCOMES.map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {to(outcome)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={`${t("attemptNotes")} · ${tcommon("optional")}`}>
            <textarea name="notes" className={areaClass} />
          </Field>
        </Action>
      ) : null}

      {has("reply") ? (
        <Action {...shared} id="reply" label={t("actionReply")} action={replyAction}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("attemptChannel")}>
              <select name="channel" className={selectClass} defaultValue="EMAIL">
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {tc(channel)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("replyTone")}>
              <select name="tone" className={selectClass} defaultValue="positive">
                <option value="positive">{t("replyPositive")}</option>
                <option value="negative">{t("replyNegative")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("replyText")}>
            <textarea name="notes" className={areaClass} required />
          </Field>
        </Action>
      ) : null}

      {has("schedule") ? (
        <Action {...shared} id="schedule" label={t("actionSchedule")} action={scheduleAction}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("scheduleDate")}>
              <TextInput type="date" name="date" defaultValue={today()} required />
            </Field>
            <Field label={t("scheduleTime")}>
              <TextInput type="time" name="time" defaultValue="10:00" required />
            </Field>
            <Field label={t("scheduleDuration")}>
              <select name="duration" className={selectClass} defaultValue={String(defaultDuration)}>
                {[15, 30, 45, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`${t("scheduleLocation")} · ${tcommon("optional")}`}>
              <TextInput name="location" />
            </Field>
            <Field label={`${t("scheduleUrl")} · ${tcommon("optional")}`}>
              <TextInput name="meetingUrl" dir="ltr" />
            </Field>
          </div>
        </Action>
      ) : null}

      {has("reschedule") ? (
        <Action {...shared} id="reschedule" label={t("actionReschedule")} action={rescheduleAction}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("scheduleDate")}>
              <TextInput type="date" name="date" defaultValue={today()} required />
            </Field>
            <Field label={t("scheduleTime")}>
              <TextInput type="time" name="time" defaultValue="10:00" required />
            </Field>
            <Field label={t("scheduleDuration")}>
              <select name="duration" className={selectClass} defaultValue={String(defaultDuration)}>
                {[15, 30, 45, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={`${t("scheduleReason")} · ${tcommon("optional")}`}>
            <textarea name="reason" className={areaClass} />
          </Field>
        </Action>
      ) : null}

      {has("requestInfo") ? (
        <Action {...shared} id="requestInfo" label={t("actionRequestInfo")} action={requestInfoAction}>
          <Field label={t("question")}>
            <textarea name="question" className={areaClass} required />
          </Field>
        </Action>
      ) : null}

      {has("provideInfo") ? (
        <Action {...shared} id="provideInfo" label={t("actionProvideInfo")} action={provideInfoAction}>
          <Field label={t("answer")}>
            <textarea name="answer" className={areaClass} required />
          </Field>
        </Action>
      ) : null}

      {has("requestReschedule") ? (
        <Action
          {...shared}
          id="requestReschedule"
          label={t("actionRequestReschedule")}
          action={requestRescheduleAction}
        >
          <Field label={t("reason")}>
            <textarea name="reason" className={areaClass} required />
          </Field>
        </Action>
      ) : null}

      {has("note") ? (
        <Action {...shared} id="note" label={t("actionNote")} action={noteAction}>
          <Field label={t("noteText")}>
            <textarea name="note" className={areaClass} required />
          </Field>
        </Action>
      ) : null}

      {has("summary") ? (
        <Action {...shared} id="summary" label={t("actionSummary")} action={summaryAction}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ts("tookPlace")}>
              <select name="tookPlace" className={selectClass} defaultValue="yes">
                <option value="yes">{tcommon("yes")}</option>
                <option value="no">{tcommon("no")}</option>
              </select>
            </Field>
            <Field label={ts("outcome")}>
              <select name="outcome" className={selectClass} defaultValue="SUCCESS">
                {SUMMARY_OUTCOMES.map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {tso(outcome)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={ts("text")}>
            <textarea name="summary" className={areaClass} required />
          </Field>

          <fieldset className="flex flex-col gap-3 rounded-[10px] p-3 shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]">
            <legend className="px-1 text-[13px] text-moon-mist">{ts("tasks")}</legend>

            {Array.from({ length: taskCount }, (_, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                <TextInput name="taskDescription" placeholder={ts("taskDescription")} />
                <select name="taskAssignee" className={selectClass} defaultValue="">
                  <option value="">{ts("taskAssignee")}</option>
                  {colleagues.map((colleague) => (
                    <option key={colleague.id} value={colleague.id}>
                      {colleague.fullName}
                    </option>
                  ))}
                </select>
                <TextInput type="date" name="taskDue" />
              </div>
            ))}

            <Button
              type="button"
              variant="quiet"
              className="self-start"
              onClick={() => setTaskCount((count) => Math.min(6, count + 1))}
            >
              {ts("addTask")}
            </Button>
          </fieldset>

          <Field label={ts("needsFollowup")}>
            <select name="needsFollowup" className={selectClass} defaultValue="no">
              <option value="no">{tcommon("no")}</option>
              <option value="yes">{tcommon("yes")}</option>
            </select>
          </Field>
        </Action>
      ) : null}

      {has("decline") ? (
        <Action {...shared} id="decline" label={t("actionDecline")} action={declineAction}>
          <Field label={t("reason")}>
            <textarea name="reason" className={areaClass} />
          </Field>
        </Action>
      ) : null}

      {has("cancel") ? (
        <Action {...shared} id="cancel" label={t("actionCancel")} action={cancelAction}>
          <Field label={t("reason")}>
            <textarea name="reason" className={areaClass} />
          </Field>
        </Action>
      ) : null}
    </div>
  );
}
