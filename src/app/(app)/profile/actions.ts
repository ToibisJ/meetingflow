"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireUser } from "@/lib/current-user";
import { writeAudit } from "@/lib/audit";
import { LOCALE_COOKIE } from "@/i18n/request";
import type { ProfileState } from "./form-state";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function saveProfileAction(
  _prev: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const ctx = await requireUser();

  const fullName = text(form, "fullName");
  if (!fullName) return { ok: false, message: "צריך למלא שם מלא." };

  const before = await ctx.db.user.findUnique({
    where: { id: ctx.session.id },
    select: {
      fullName: true,
      phone: true,
      whatsapp: true,
      jobTitle: true,
      workStart: true,
      workEnd: true,
      locale: true,
    },
  });

  const locale = text(form, "locale") === "en" ? "en" : "he";

  const after = {
    fullName,
    phone: text(form, "phone") || null,
    whatsapp: text(form, "whatsapp") || null,
    jobTitle: text(form, "jobTitle") || null,
    workStart: text(form, "workStart") || null,
    workEnd: text(form, "workEnd") || null,
    locale: locale as "he" | "en",
  };

  await ctx.db.user.update({ where: { id: ctx.session.id }, data: after });

  await writeAudit(ctx.db, {
    organizationId: ctx.session.organizationId,
    actor: { userId: ctx.session.id, userName: ctx.session.fullName },
    entity: "User",
    entityId: ctx.session.id,
    action: "update_profile",
    before: before ?? undefined,
    after,
  });

  // The cookie mirrors the stored preference, so the next render already uses it.
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/profile");
  return { ok: true, message: null };
}
