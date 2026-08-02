"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { signIn } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/i18n/request";

export type LoginState = {
  error: "invalid_credentials" | "account_disabled" | "generic" | null;
};

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "invalid_credentials" };
  }

  const result = await signIn(email, password);

  if (!result.ok) {
    return {
      error:
        result.reason === "invalid_credentials"
          ? "invalid_credentials"
          : "account_disabled",
    };
  }

  // Mirror the user's language preference so server components can read it
  // without a database round trip on every render.
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, result.locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
