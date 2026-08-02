import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { Badge, Eyebrow, EmptyState, GlassCard, TextInput } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { formatEventTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

function toInternational(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.length < 7) return null;
  if (cleaned.startsWith("972")) return cleaned;
  return cleaned.startsWith("0") ? `972${cleaned.slice(1)}` : cleaned;
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const ctx = await requireUser();
  const t = await getTranslations();

  const term = q?.trim();

  const contacts = await ctx.db.contact.findMany({
    where: term
      ? {
          OR: [
            { fullName: { contains: term, mode: "insensitive" } },
            { company: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
            { phone: { contains: term } },
          ],
        }
      : {},
    select: {
      id: true,
      fullName: true,
      company: true,
      jobTitle: true,
      phone: true,
      email: true,
      requests: {
        select: { requestNumber: true, subject: true, status: true, lastActivityAt: true },
        orderBy: { lastActivityAt: "desc" },
        take: 3,
      },
      _count: { select: { requests: true } },
    },
    orderBy: { fullName: "asc" },
    take: 200,
  });

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.contacts")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">{t("contacts.title")}</h1>
      </header>

      <GlassCard>
        <form action="/contacts" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[260px] flex-1 flex-col gap-2">
            <span className="text-[13px] text-moon-mist">{t("common.search")}</span>
            <TextInput name="q" defaultValue={term ?? ""} />
          </label>
          <button
            type="submit"
            className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-5 py-2.5 text-[14px] font-medium text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
          >
            {t("common.search")}
          </button>
        </form>
      </GlassCard>

      {contacts.length === 0 ? (
        <GlassCard>
          <EmptyState title={t("contacts.empty")} />
        </GlassCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {contacts.map((contact) => {
            const wa = toInternational(contact.phone);

            return (
              <GlassCard key={contact.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[16px] text-frost-glow">{contact.fullName}</p>
                    <p className="text-[12.5px] text-fog-veil">
                      {[contact.jobTitle, contact.company].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <Badge>
                    {contact._count.requests} {t("contacts.requestCount")}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone.replace(/\D/g, "")}`}
                      className="inline-flex items-center gap-1.5 rounded-[999px] bg-[rgba(186,214,247,0.06)] px-3 py-1.5 text-[12.5px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]"
                      dir="ltr"
                    >
                      <Phone size={13} />
                      {contact.phone}
                    </a>
                  ) : null}
                  {wa ? (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[999px] bg-[rgba(38,150,132,0.16)] px-3 py-1.5 text-[12.5px] text-[#7fd7c6] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]"
                    >
                      <MessageCircle size={13} />
                      {t("request.whatsapp")}
                    </a>
                  ) : null}
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1.5 rounded-[999px] bg-[rgba(186,214,247,0.06)] px-3 py-1.5 text-[12.5px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]"
                      dir="ltr"
                    >
                      <Mail size={13} />
                      {contact.email}
                    </a>
                  ) : null}
                </div>

                {contact.requests.length > 0 ? (
                  <ul className="flex flex-col gap-1 border-t border-[rgba(186,215,247,0.12)] pt-3">
                    {contact.requests.map((request) => (
                      <li key={request.requestNumber}>
                        <Link
                          href={`/requests/${request.requestNumber}`}
                          className="flex flex-wrap items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                        >
                          <span className="tabular-nums text-fog-veil">
                            #{request.requestNumber}
                          </span>
                          <span className="flex-1 truncate text-moon-mist">
                            {request.subject}
                          </span>
                          <span className="text-[11.5px] text-fog-veil">
                            {formatEventTime(request.lastActivityAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
