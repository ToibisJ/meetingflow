import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

import { Eyebrow } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { NewRequestForm } from "./new-request-form";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const ctx = await requireUser();

  // The sidebar hides this link without the permission; the page checks again,
  // because a hidden link is not a security boundary.
  if (!can(ctx.session.role, "request:create")) redirect("/dashboard");

  const t = await getTranslations();

  const [contacts, colleagues] = await Promise.all([
    ctx.db.contact.findMany({
      select: { id: true, fullName: true, company: true, phone: true, email: true },
      orderBy: { fullName: "asc" },
      take: 300,
    }),
    ctx.db.user.findMany({
      where: { isActive: true, id: { not: ctx.session.id } },
      select: { id: true, fullName: true, jobTitle: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/my-requests"
          className="inline-flex w-fit items-center gap-1 text-[13px] text-fog-veil hover:text-frost-glow"
        >
          <ChevronRight size={14} className="rtl:rotate-0 ltr:rotate-180" />
          {t("nav.myRequests")}
        </Link>
        <Eyebrow>{t("nav.newRequest")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          {t("newRequest.title")}
        </h1>
        <p className="text-[14px] text-fog-veil">{t("newRequest.subtitle")}</p>
      </header>

      <NewRequestForm contacts={contacts} colleagues={colleagues} />
    </div>
  );
}
