"use client";

import { useActionState } from "react";

import {
  ErrorNote,
  Field,
  SubmitButton,
  TextInput,
} from "@/components/ui/primitives";
import { loginAction, type LoginState } from "./actions";

export type LoginLabels = {
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  invalidCredentials: string;
  accountDisabled: string;
  generic: string;
};

const INITIAL: LoginState = { error: null };

export function LoginForm({ labels }: { labels: LoginLabels }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  const message =
    state.error === "invalid_credentials"
      ? labels.invalidCredentials
      : state.error === "account_disabled"
        ? labels.accountDisabled
        : state.error === "generic"
          ? labels.generic
          : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {message ? <ErrorNote>{message}</ErrorNote> : null}

      {/* Deliberately type="text": the login identifier is whatever the
          administrator set, which may be a plain username rather than an
          address. Browser email validation would reject those. */}
      <Field label={labels.email}>
        <TextInput
          name="email"
          type="text"
          autoComplete="username"
          required
          dir="ltr"
          className="text-left"
        />
      </Field>

      <Field label={labels.password}>
        <TextInput
          name="password"
          type="password"
          autoComplete="current-password"
          required
          dir="ltr"
          className="text-left"
        />
      </Field>

      <SubmitButton type="submit" disabled={pending} className="mt-2">
        {pending ? labels.signingIn : labels.signIn}
      </SubmitButton>
    </form>
  );
}
