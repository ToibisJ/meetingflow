import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  ScrollText,
  Settings,
  Sun,
  Users,
} from "lucide-react";

import { requireUser } from "@/lib/current-user";
import { can, type Permission } from "@/lib/rbac";
import { cn } from "@/components/ui/primitives";
import { SignOutButton } from "./sign-out-button";

/**
 * The signed-in shell.
 *
 * The sidebar is filtered by permission here, on the server. Hiding a link is a
 * convenience — the page behind it checks the same permission again, because a
 * hidden link is not a security boundary.
 */

type NavEntry = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  permission: Permission | null;
};

const SECTIONS: { titleKey: string; entries: NavEntry[] }[] = [
  {
    titleKey: "nav.sectionWork",
    entries: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, permission: null },
      { href: "/my-day", labelKey: "nav.myDay", icon: Sun, permission: null },
      { href: "/requests/new", labelKey: "nav.newRequest", icon: PlusCircle, permission: "request:create" },
      { href: "/my-requests", labelKey: "nav.myRequests", icon: ClipboardList, permission: null },
      { href: "/requests", labelKey: "nav.allRequests", icon: Inbox, permission: "request:read:all" },
      { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, permission: null },
      { href: "/tasks", labelKey: "nav.tasks", icon: ListChecks, permission: null },
    ],
  },
  {
    titleKey: "nav.sectionInsight",
    entries: [
      { href: "/contacts", labelKey: "nav.contacts", icon: Users, permission: "contact:read" },
      { href: "/analytics", labelKey: "nav.analytics", icon: BarChart3, permission: "analytics:self" },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell, permission: null },
    ],
  },
  {
    titleKey: "nav.sectionAdmin",
    entries: [
      { href: "/admin/users", labelKey: "nav.users", icon: Users, permission: "users:manage" },
      { href: "/admin/audit", labelKey: "nav.auditLog", icon: ScrollText, permission: "audit:read:all" },
      { href: "/admin/settings", labelKey: "nav.settings", icon: Settings, permission: "settings:manage" },
    ],
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireUser();
  const t = await getTranslations();

  const sections = SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter(
      (entry) => entry.permission === null || can(session.role, entry.permission),
    ),
  })).filter((section) => section.entries.length > 0);

  return (
    <div className="relative z-10 flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-6 overflow-y-auto border-e border-[rgba(186,215,247,0.12)] px-4 py-6 lg:flex">
        <Link href="/dashboard" className="px-2">
          <span
            className="mf-skywash text-[22px] font-medium"
            style={{ fontFamily: "var(--font-aeonikpro)" }}
          >
            MeetingFlow
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-6">
          {sections.map((section) => (
            <div key={section.titleKey} className="flex flex-col gap-1">
              <p
                className="px-2 pb-1 text-[12px] uppercase tracking-[0.1em] text-fog-veil"
                style={{ fontFamily: "var(--font-dotdigital)" }}
              >
                {t(section.titleKey)}
              </p>
              {section.entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className={cn(
                      "flex items-center gap-3 rounded-[6px] px-2 py-2 text-[14px] text-moon-mist",
                      "transition-colors hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow",
                    )}
                  >
                    <Icon size={16} className="shrink-0 opacity-70" />
                    {t(entry.labelKey)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-[rgba(186,215,247,0.12)] pt-4">
          <div className="px-2">
            <p className="text-[14px] text-frost-glow">{session.fullName}</p>
            <p className="text-[12px] text-fog-veil">{t(`roles.${session.role}`)}</p>
            <p className="text-[12px] text-fog-veil">{session.organizationName}</p>
          </div>
          <SignOutButton label={t("common.signOut")} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
    </div>
  );
}
