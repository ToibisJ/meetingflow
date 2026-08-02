import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Eye } from "lucide-react";

import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { leavePreviewAction } from "./roles/actions";
import { TopNav, type NavChild, type NavItem } from "./top-nav";

/**
 * The signed-in shell.
 *
 * One fixed bar carries the whole product: every section, the global search, the
 * primary action, notifications and the account. It is identical on every screen
 * and never scrolls away, so the way out of a page is always in the same place.
 *
 * The bar is assembled here, on the server, and filtered by permission. Hiding a
 * link is a convenience — the page behind it checks the same permission again,
 * because a hidden link is not a security boundary.
 */

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireUser();
  const { session, db } = ctx;
  const t = await getTranslations();
  // Client components inside the shell translate with the same dictionary the
  // server used, so a label never exists in two places.
  const messages = await getMessages();

  // The unread count sits in the shell so it is visible from every screen.
  const unread = await db.notification.count({
    where: { userId: session.id, isRead: false },
  });

  const items: NavItem[] = [
    { kind: "link", href: "/dashboard", label: t("nav.dashboard"), match: ["/dashboard"] },
    { kind: "link", href: "/my-day", label: t("nav.myDay"), match: ["/my-day"] },
  ];

  // Everything about requests lives under one heading, so the list, your own
  // meetings and the intake form are never more than two clicks apart.
  const requestChildren: NavChild[] = [];
  if (can(session.role, "request:read:all")) {
    requestChildren.push({ href: "/requests", label: t("nav.allRequests") });
  }
  requestChildren.push({ href: "/my-requests", label: t("nav.myRequests") });
  if (can(session.role, "request:create")) {
    requestChildren.push({ href: "/requests/new", label: t("nav.newRequest") });
  }
  items.push({
    kind: "menu",
    id: "requests",
    label: t("nav.sectionRequests"),
    match: ["/requests", "/my-requests"],
    children: requestChildren,
  });

  items.push(
    { kind: "link", href: "/calendar", label: t("nav.calendar"), match: ["/calendar"] },
    { kind: "link", href: "/tasks", label: t("nav.tasks"), match: ["/tasks"] },
    // Every role has a log; what differs is how far it reaches.
    { kind: "link", href: "/log", label: t("nav.log"), match: ["/log"] },
  );

  if (can(session.role, "contact:read")) {
    items.push({ kind: "link", href: "/contacts", label: t("nav.contacts"), match: ["/contacts"] });
  }
  if (can(session.role, "analytics:self")) {
    items.push({ kind: "link", href: "/analytics", label: t("nav.analytics"), match: ["/analytics"] });
  }

  const adminChildren: NavChild[] = [];
  if (can(session.role, "users:manage")) {
    adminChildren.push({ href: "/admin/users", label: t("nav.users") });
  }
  if (can(session.role, "audit:read:all")) {
    adminChildren.push({ href: "/admin/audit", label: t("nav.auditLog") });
  }
  if (can(session.role, "settings:manage")) {
    adminChildren.push({ href: "/admin/settings", label: t("nav.settings") });
  }
  if (adminChildren.length > 0) {
    items.push({
      kind: "menu",
      id: "admin",
      label: t("nav.sectionAdmin"),
      match: ["/admin"],
      children: adminChildren,
    });
  }

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="relative z-10 flex min-h-screen flex-col">
        <TopNav
          items={items}
          unread={unread}
          canCreate={can(session.role, "request:create")}
          user={{
            name: session.fullName,
            role: t(`roles.${session.role}`),
            organization: session.organizationName,
          }}
          labels={{
            newRequest: t("nav.newRequest"),
            notifications: t("nav.notifications"),
            guide: t("nav.guide"),
            profile: t("nav.profile"),
            roles: t("nav.roles"),
            signOut: t("common.signOut"),
            search: t("nav.search"),
            openMenu: t("nav.openMenu"),
            closeMenu: t("nav.closeMenu"),
            account: t("nav.account"),
          }}
        />

        {/* Everything that must stay in view rides in one sticky block under the
            bar, so the preview banner and the counters cannot cover each other. */}
        <div className="sticky top-[64px] z-40">
          {ctx.preview ? (
            <div className="border-b border-[rgba(102,58,243,0.4)] bg-[rgba(102,58,243,0.16)] backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-[16px] py-2.5 lg:px-[24px]">
                <Eye size={16} className="shrink-0 text-[#c0acff]" />
                <p className="flex-1 text-[13.5px] text-frost-glow">
                  אתה רואה את המערכת כ{ctx.session.fullName} ·{" "}
                  {t(`roles.${ctx.session.role}`)}. התצוגה לקריאה בלבד, ושום פעולה לא
                  תישמר. באמת מחובר: {ctx.preview.realName}.
                </p>
                <form action={leavePreviewAction}>
                  <button
                    type="submit"
                    className="rounded-[999px] bg-void-violet px-3.5 py-1.5 text-[13px] font-medium text-pure-white transition-opacity hover:opacity-90"
                  >
                    חזרה לעצמי
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          <KpiStrip db={db} session={session} />
        </div>

        {/* Bracket sizes on purpose: globals.css sets the spacing scale in
            pixels, so px-4 would be four pixels rather than a rem-based gutter. */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-[16px] py-[28px] lg:px-[24px]">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
