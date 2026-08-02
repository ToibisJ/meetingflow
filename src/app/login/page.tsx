import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Eyebrow } from "@/components/ui/primitives";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) {
    redirect("/dashboard");
  }

  const t = await getTranslations();

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-[420px] flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Eyebrow>Coordination, measured</Eyebrow>
          <p
            className="mf-skywash text-[48px] leading-[1.1] font-medium"
            style={{ fontFamily: "var(--font-aeonikpro)" }}
          >
            MeetingFlow
          </p>
        </div>

        {/* Deep-glass modal surface: the one card the design system scales up. */}
        <div className="rounded-[16px] bg-[rgba(5,6,15,0.97)] p-8 shadow-[inset_0_1px_1px_rgba(216,236,248,0.2),inset_0_24px_48px_rgba(168,216,245,0.06),0_16px_32px_rgba(0,0,0,0.3)]">
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="text-[24px] font-medium text-ice-highlight">
              {t("auth.signInTitle")}
            </h1>
            <p className="text-[14px] text-fog-veil">{t("auth.signInSubtitle")}</p>
          </div>

          <LoginForm
            labels={{
              email: t("auth.email"),
              password: t("auth.password"),
              signIn: t("auth.signIn"),
              signingIn: t("auth.signingIn"),
              invalidCredentials: t("auth.invalidCredentials"),
              accountDisabled: t("auth.accountDisabled"),
              generic: t("errors.generic"),
            }}
          />
        </div>

        <p className="text-center text-[12px] text-fog-veil">{t("common.tagline")}</p>
      </div>
    </main>
  );
}
