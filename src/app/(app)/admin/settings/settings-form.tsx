"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button, ErrorNote, Field, TextInput } from "@/components/ui/primitives";
import type { SlaSettings } from "@/services/settings";
import { saveSlaAction } from "./actions";
import { SETTINGS_IDLE } from "./form-state";

export function SettingsForm({ values }: { values: SlaSettings }) {
  const t = useTranslations("admin");
  const tp = useTranslations("profile");

  const [state, formAction, pending] = useActionState(saveSlaAction, SETTINGS_IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? <ErrorNote>{state.message}</ErrorNote> : null}
      {state.ok ? (
        <p className="rounded-[6px] bg-[rgba(38,150,132,0.14)] px-3 py-2 text-[14px] text-[#7fd7c6]">
          {tp("saved")}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("slaNewRequestHours")}>
          <TextInput
            type="number"
            min={1}
            max={168}
            name="newRequestHours"
            defaultValue={values.newRequestHours}
          />
        </Field>

        <Field label={t("slaNoActivityDays")}>
          <TextInput
            type="number"
            min={1}
            max={60}
            name="noActivityDays"
            defaultValue={values.noActivityDays}
          />
        </Field>

        <Field label={t("slaWaitingContactDays")}>
          <TextInput
            type="number"
            min={1}
            max={60}
            name="waitingContactDays"
            defaultValue={values.waitingContactDays}
          />
        </Field>

        <Field label={t("slaSummaryDueHours")}>
          <TextInput
            type="number"
            min={1}
            max={336}
            name="summaryDueHours"
            defaultValue={values.summaryDueHours}
          />
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="self-start px-8">
        {pending ? tp("saving") : tp("save")}
      </Button>
    </form>
  );
}
