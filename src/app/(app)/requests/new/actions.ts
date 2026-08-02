"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/current-user";
import type { MeetingType, Priority } from "@/generated/prisma/enums";
import { createRequest } from "@/services/requests/actions";
import type { NewRequestState } from "./form-state";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function optionalDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createRequestAction(
  _prev: NewRequestState,
  form: FormData,
): Promise<NewRequestState> {
  const ctx = await requireUser();

  const subject = text(form, "subject");
  if (!subject) {
    return { message: "צריך לכתוב נושא לפגישה." };
  }

  const contactMode = text(form, "contactMode");
  const existingContactId = text(form, "contactId");
  const contactName = text(form, "contactFullName");

  if (contactMode === "existing" && !existingContactId) {
    return { message: "בחר איש קשר קיים, או עבור ליצירת איש קשר חדש." };
  }

  if (contactMode === "new" && !contactName) {
    return { message: "צריך למלא את שם איש הקשר." };
  }

  const mode = text(form, "datePreferenceMode") as
    | "EXACT"
    | "OPTIONS"
    | "RANGE"
    | "NONE";

  // Alternative slots arrive as parallel arrays from the repeatable rows.
  const optionDates = form.getAll("optionDate").map(String);
  const optionTimes = form.getAll("optionTime").map(String);

  const dateOptions =
    mode === "OPTIONS"
      ? optionDates
          .map((value, index) => ({
            date: optionalDate(value),
            time: optionTimes[index] || null,
          }))
          .filter((option): option is { date: Date; time: string | null } =>
            option.date !== null,
          )
      : [];

  const result = await createRequest(ctx, {
    type: text(form, "type") as MeetingType,
    priority: text(form, "priority") as Priority,
    subject,
    purpose: text(form, "purpose") || null,
    description: text(form, "description") || null,
    desiredOutcome: text(form, "desiredOutcome") || null,
    hadPriorContact: text(form, "hadPriorContact") === "yes",
    priorContactBy: text(form, "priorContactBy") || null,
    priorContactNotes: text(form, "priorContactNotes") || null,
    datePreferenceMode: mode,
    preferredDate: mode === "EXACT" ? optionalDate(text(form, "preferredDate")) : null,
    preferredTime: mode === "EXACT" ? text(form, "preferredTime") || null : null,
    rangeStart: mode === "RANGE" ? optionalDate(text(form, "rangeStart")) : null,
    rangeEnd: mode === "RANGE" ? optionalDate(text(form, "rangeEnd")) : null,
    dateOptions,
    participantIds: form.getAll("participants").map(String).filter(Boolean),
    contact:
      contactMode === "existing"
        ? { mode: "existing", contactId: existingContactId }
        : {
            mode: "new",
            fullName: contactName,
            company: text(form, "company") || null,
            jobTitle: text(form, "jobTitle") || null,
            phone: text(form, "phone") || null,
            phoneAlt: text(form, "phoneAlt") || null,
            email: text(form, "email") || null,
            website: text(form, "website") || null,
            linkedin: text(form, "linkedin") || null,
            notes: text(form, "contactNotes") || null,
          },
  });

  if (!result.ok) {
    return { message: result.message };
  }

  redirect(`/requests/${result.requestNumber}`);
}
