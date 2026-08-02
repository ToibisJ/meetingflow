"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button, ErrorNote, Field, TextInput, cn } from "@/components/ui/primitives";
import { saveProfileAction } from "./actions";
import { PROFILE_IDLE } from "./form-state";

const selectClass = cn(
  "w-full rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[14px] text-pure-white",
  "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] focus:outline-none",
);

export type ProfileValues = {
  fullName: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  jobTitle: string | null;
  workStart: string | null;
  workEnd: string | null;
  locale: string;
};

export function ProfileForm({ values }: { values: ProfileValues }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");

  const [state, formAction, pending] = useActionState(saveProfileAction, PROFILE_IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? <ErrorNote>{state.message}</ErrorNote> : null}
      {state.ok ? (
        <p className="rounded-[6px] bg-[rgba(38,150,132,0.14)] px-3 py-2 text-[14px] text-[#7fd7c6]">
          {t("saved")}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fullName")}>
          <TextInput name="fullName" defaultValue={values.fullName} required />
        </Field>

        <Field label={t("jobTitle")}>
          <TextInput name="jobTitle" defaultValue={values.jobTitle ?? ""} />
        </Field>

        <Field label={t("email")} hint={t("emailHint")}>
          <TextInput value={values.email} readOnly dir="ltr" className="opacity-70" />
        </Field>

        <Field label={t("phone")}>
          <TextInput name="phone" defaultValue={values.phone ?? ""} dir="ltr" inputMode="tel" />
        </Field>

        <Field label={t("whatsapp")} hint={t("whatsappHint")}>
          <TextInput
            name="whatsapp"
            defaultValue={values.whatsapp ?? ""}
            dir="ltr"
            inputMode="tel"
            placeholder="972501234567"
          />
        </Field>

        <Field label={tc("language")}>
          <select name="locale" defaultValue={values.locale} className={selectClass}>
            <option value="he">{tc("hebrew")}</option>
            <option value="en">{tc("english")}</option>
          </select>
        </Field>

        <Field label={t("workStart")}>
          <TextInput type="time" name="workStart" defaultValue={values.workStart ?? "09:00"} />
        </Field>

        <Field label={t("workEnd")}>
          <TextInput type="time" name="workEnd" defaultValue={values.workEnd ?? "18:00"} />
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="self-start px-8">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
