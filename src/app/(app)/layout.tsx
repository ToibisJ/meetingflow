import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
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
  const { session, db } = await requireUser();
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
            signOut: t("common.signOut"),
            search: t("nav.search"),
            openMenu: t("nav.openMenu"),
            closeMenu: t("nav.closeMenu"),
            account: t("nav.account"),
          }}
        />

        {/* Bracket sizes on purpose: globals.css sets the spacing scale in
            pixels, so px-4 would be four pixels rather than a rem-based gutter. */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-[16px] py-[28px] lg:px-[24px]">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
