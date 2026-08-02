"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Monitor, Phone, Plus, Trash2 } from "lucide-react";

import {
  Button,
  ErrorNote,
  Field,
  GlassCard,
  SubmitButton,
  TextInput,
  cn,
} from "@/components/ui/primitives";
import { createRequestAction } from "./actions";
import { NEW_REQUEST_IDLE } from "./form-state";

/**
 * The form an employee fills in to ask for a meeting.
 *
 * It is written to be finished in one sitting: the shape of the request is
 * chosen first, then who to meet, then why, then when. Only the fields that
 * apply to the chosen date preference are shown, so the form never asks for a
 * date range and three alternatives at the same time.
 */

export type ContactOption = {
  id: string;
  fullName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
};

export type ColleagueOption = { id: string; fullName: string; jobTitle: string | null };

const MEETING_TYPES = [
  { value: "IN_PERSON", icon: CalendarDays },
  { value: "PHONE", icon: Phone },
  { value: "VIDEO", icon: Monitor },
] as const;

const PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;

const DATE_MODES = [
  { value: "EXACT", labelKey: "dateModeExact" },
  { value: "OPTIONS", labelKey: "dateModeOptions" },
  { value: "RANGE", labelKey: "dateModeRange" },
  { value: "NONE", labelKey: "dateModeNone" },
] as const;

const selectClass = cn(
  "w-full rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[14px] text-pure-white",
  "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] focus:outline-none",
  "focus:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.24)]",
);

const areaClass = cn(selectClass, "min-h-[92px] resize-y");

function Choice({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-[999px] px-4 py-2.5 text-[14px] transition-colors",
        "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
        active
          ? "bg-[rgba(102,58,243,0.2)] text-[#c0acff]"
          : "bg-[rgba(186,214,247,0.04)] text-moon-mist hover:bg-[rgba(186,214,247,0.1)]",
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="text-[12px] tabular-nums text-fog-veil"
        style={{ fontFamily: "var(--font-dotdigital)" }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <h2 className="text-[17px] font-medium text-ice-highlight">{children}</h2>
    </div>
  );
}

export function NewRequestForm({
  contacts,
  colleagues,
}: {
  contacts: ContactOption[];
  colleagues: ColleagueOption[];
}) {
  const t = useTranslations("newRequest");
  const tt = useTranslations("meetingType");
  const tp = useTranslations("priority");
  const tc = useTranslations("common");

  const [state, formAction, pending] = useActionState(
    createRequestAction,
    NEW_REQUEST_IDLE,
  );

  const [type, setType] = useState<string>("IN_PERSON");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [contactMode, setContactMode] = useState<"existing" | "new">(
    contacts.length > 0 ? "existing" : "new",
  );
  const [dateMode, setDateMode] = useState<string>("NONE");
  const [optionCount, setOptionCount] = useState(3);
  const [priorContact, setPriorContact] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="contactMode" value={contactMode} />
      <input type="hidden" name="datePreferenceMode" value={dateMode} />
      <input type="hidden" name="hadPriorContact" value={priorContact ? "yes" : "no"} />

      {state.message ? <ErrorNote>{state.message}</ErrorNote> : null}

      {/* ------------------------------------------------------- 1. type */}
      <GlassCard className="flex flex-col gap-4">
        <SectionTitle index={1}>{t("stepType")}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {MEETING_TYPES.map((option) => {
            const Icon = option.icon;
            return (
              <Choice
                key={option.value}
                active={type === option.value}
                onClick={() => setType(option.value)}
              >
                <Icon size={16} />
                {tt(option.value)}
              </Choice>
            );
          })}
        </div>
      </GlassCard>

      {/* ---------------------------------------------------- 2. contact */}
      <GlassCard className="flex flex-col gap-4">
        <SectionTitle index={2}>{t("stepContact")}</SectionTitle>

        <div className="flex flex-wrap gap-2">
          <Choice active={contactMode === "existing"} onClick={() => setContactMode("existing")}>
            {t("contactExisting")}
          </Choice>
          <Choice active={contactMode === "new"} onClick={() => setContactMode("new")}>
            {t("contactNew")}
          </Choice>
        </div>

        {contactMode === "existing" ? (
          <Field label={t("contactExisting")}>
            <select name="contactId" className={selectClass} defaultValue="">
              <option value="">—</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.fullName}
                  {contact.company ? ` · ${contact.company}` : ""}
                  {contact.phone ? ` · ${contact.phone}` : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fullName")}>
              <TextInput name="contactFullName" required={contactMode === "new"} />
            </Field>
            <Field label={t("company")}>
              <TextInput name="company" />
            </Field>
            <Field label={t("jobTitle")}>
              <TextInput name="jobTitle" />
            </Field>
            <Field label={t("phone")}>
              <TextInput name="phone" dir="ltr" inputMode="tel" />
            </Field>
            <Field label={`${t("phoneAlt")} · ${tc("optional")}`}>
              <TextInput name="phoneAlt" dir="ltr" inputMode="tel" />
            </Field>
            <Field label={t("email")}>
              <TextInput name="email" type="email" dir="ltr" />
            </Field>
            <Field label={`${t("website")} · ${tc("optional")}`}>
              <TextInput name="website" dir="ltr" />
            </Field>
            <Field label={`${t("linkedin")} · ${tc("optional")}`}>
              <TextInput name="linkedin" dir="ltr" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={`${t("notes")} · ${tc("optional")}`}>
                <textarea name="contactNotes" className={areaClass} />
              </Field>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ---------------------------------------------------- 3. details */}
      <GlassCard className="flex flex-col gap-4">
        <SectionTitle index={3}>{t("stepDetails")}</SectionTitle>

        <Field label={t("subject")}>
          <TextInput name="subject" required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("purpose")}>
            <TextInput name="purpose" />
          </Field>
          <Field label={t("desiredOutcome")}>
            <TextInput name="desiredOutcome" />
          </Field>
        </div>

        <Field label={`${t("description")} · ${tc("optional")}`}>
          <textarea name="description" className={areaClass} />
        </Field>

        <div className="flex flex-col gap-3 rounded-[10px] p-4 shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[14px] text-moon-mist">{t("hadPriorContact")}</span>
            <Choice active={!priorContact} onClick={() => setPriorContact(false)}>
              {tc("no")}
            </Choice>
            <Choice active={priorContact} onClick={() => setPriorContact(true)}>
              {tc("yes")}
            </Choice>
          </div>

          {priorContact ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("priorContactBy")}>
                <TextInput name="priorContactBy" />
              </Field>
              <Field label={t("priorContactNotes")}>
                <TextInput name="priorContactNotes" />
              </Field>
            </div>
          ) : null}
        </div>
      </GlassCard>

      {/* --------------------------------------------------- 4. priority */}
      <GlassCard className="flex flex-col gap-4">
        <SectionTitle index={4}>{t("stepPriority")}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((value) => (
            <Choice key={value} active={priority === value} onClick={() => setPriority(value)}>
              {tp(value)}
            </Choice>
          ))}
        </div>
      </GlassCard>

      {/* ------------------------------------------------------- 5. date */}
      <GlassCard className="flex flex-col gap-4">
        <SectionTitle index={5}>{t("stepDate")}</SectionTitle>

        <div className="flex flex-wrap gap-2">
          {DATE_MODES.map((mode) => (
            <Choice
              key={mode.value}
              active={dateMode === mode.value}
              onClick={() => setDateMode(mode.value)}
            >
              {t(mode.labelKey)}
            </Choice>
          ))}
        </div>

        {dateMode === "EXACT" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("preferredDate")}>
              <TextInput type="date" name="preferredDate" />
            </Field>
            <Field label={t("preferredTime")}>
              <TextInput type="time" name="preferredTime" />
            </Field>
          </div>
        ) : null}

        {dateMode === "OPTIONS" ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: optionCount }, (_, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <TextInput type="date" name="optionDate" aria-label={t("preferredDate")} />
                <TextInput type="time" name="optionTime" aria-label={t("preferredTime")} />
                {optionCount > 1 ? (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => setOptionCount((count) => count - 1)}
                    aria-label={t("removeOption")}
                  >
                    <Trash2 size={16} />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="quiet"
              className="self-start"
              onClick={() => setOptionCount((count) => Math.min(5, count + 1))}
            >
              <Plus size={16} />
              {t("addOption")}
            </Button>
          </div>
        ) : null}

        {dateMode === "RANGE" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("rangeStart")}>
              <TextInput type="date" name="rangeStart" />
            </Field>
            <Field label={t("rangeEnd")}>
              <TextInput type="date" name="rangeEnd" />
            </Field>
          </div>
        ) : null}
      </GlassCard>

      {/* ------------------------------------------------ 6. participants */}
      <GlassCard className="flex flex-col gap-4">
        <SectionTitle index={6}>{t("stepParticipants")}</SectionTitle>
        <p className="text-[13px] text-fog-veil">{t("participantsHint")}</p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {colleagues.map((colleague) => (
            <label
              key={colleague.id}
              className="flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[14px] text-moon-mist shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.06)]"
            >
              <input
                type="checkbox"
                name="participants"
                value={colleague.id}
                className="h-4 w-4 accent-[#663af3]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-frost-glow">{colleague.fullName}</span>
                {colleague.jobTitle ? (
                  <span className="block truncate text-[12px] text-fog-veil">
                    {colleague.jobTitle}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </GlassCard>

      <div className="flex justify-start">
        <SubmitButton type="submit" disabled={pending} className="w-auto px-10">
          {pending ? t("submitting") : t("submit")}
        </SubmitButton>
      </div>
    </form>
  );
}
