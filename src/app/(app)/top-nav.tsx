"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChevronDown,
  LogOut,
  Menu,
  PlusCircle,
  Search,
  UserCircle2,
  X,
} from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { signOutAction } from "./actions";

/**
 * The one bar that is on every screen.
 *
 * Everything the product can do is reachable from here, from every page, without
 * scrolling: the sections, the global search, the primary action, notifications
 * and the account. It stays pinned to the top so you never lose your place.
 *
 * The server decides what belongs in it (permissions are filtered there and
 * checked again by each page). This component only draws it and tracks which
 * entry is the current one.
 *
 * Sizes that matter are written in brackets on purpose. globals.css defines the
 * spacing scale in pixels (--spacing-16 is 16px, not 4rem), so `h-16` would be a
 * sixteen-pixel bar. Bracket values mean exactly what they say.
 */

export type NavChild = { href: string; label: string };

export type NavItem =
  | { kind: "link"; href: string; label: string; match: string[] }
  | { kind: "menu"; id: string; label: string; match: string[]; children: NavChild[] };

export type TopNavProps = {
  items: NavItem[];
  unread: number;
  canCreate: boolean;
  user: { name: string; role: string; organization: string };
  labels: {
    newRequest: string;
    notifications: string;
    guide: string;
    profile: string;
    signOut: string;
    search: string;
    openMenu: string;
    closeMenu: string;
    account: string;
  };
};

/** A path is "inside" a section when it is the section itself or a page under it. */
function isActive(pathname: string, match: string[]) {
  return match.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

export function TopNav({ items, unread, canCreate, user, labels }: TopNavProps) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Navigating is an answer: whatever was open has served its purpose.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!openMenu) return;

    function onPointerDown(event: PointerEvent) {
      if (!barRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const linkClass = (active: boolean) =>
    cn(
      "relative flex items-center gap-1 whitespace-nowrap rounded-[6px] px-3 py-2 text-[14px] transition-colors",
      "focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.4)]",
      active
        ? "bg-[rgba(186,214,247,0.1)] text-frost-glow"
        : "text-moon-mist hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow",
    );

  const iconButtonClass = cn(
    "relative flex h-9 w-9 items-center justify-center rounded-[6px] text-moon-mist transition-colors",
    "hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow",
    "focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.4)]",
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(186,215,247,0.12)] bg-[rgba(10,10,18,0.82)] backdrop-blur-xl">
      <div
        ref={barRef}
        className="mx-auto flex h-[64px] w-full max-w-[1600px] items-center gap-2 px-[16px] lg:px-[24px]"
      >
        <Link
          href="/dashboard"
          className="shrink-0 pe-2 focus-visible:outline-none"
          aria-label="MeetingFlow"
        >
          <span
            className="mf-skywash text-[20px] font-medium"
            style={{ fontFamily: "var(--font-aeonikpro)" }}
          >
            MeetingFlow
          </span>
        </Link>

        {/* ---------------------------------------------- sections */}
        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="ניווט ראשי">
          {items.map((item) => {
            const active = isActive(pathname, item.match);

            if (item.kind === "link") {
              return (
                <Link key={item.href} href={item.href} className={linkClass(active)}>
                  {item.label}
                </Link>
              );
            }

            const open = openMenu === item.id;
            return (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => setOpenMenu(open ? null : item.id)}
                  className={linkClass(active)}
                >
                  {item.label}
                  <ChevronDown
                    size={14}
                    className={cn("opacity-60 transition-transform", open && "rotate-180")}
                  />
                </button>
                {open ? (
                  <div
                    role="menu"
                    className="absolute top-full start-0 z-50 mt-1 min-w-[200px] rounded-[10px] border border-[rgba(186,215,247,0.12)] bg-[rgba(14,14,24,0.98)] p-1 shadow-[0_24px_48px_rgba(6,6,14,0.8)]"
                  >
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        role="menuitem"
                        href={child.href}
                        className={cn(
                          "block rounded-[6px] px-3 py-2 text-[14px] transition-colors",
                          pathname === child.href
                            ? "bg-[rgba(186,214,247,0.1)] text-frost-glow"
                            : "text-moon-mist hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow",
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* ---------------------------------------------- global search */}
        {/* Submits to the request list, which already searches subject, purpose,
            contact name, company, phone, email, requester and summary text.
            The full field needs room the section links have first claim on, so
            between 1280 and 1536 it becomes an icon onto the same list, and
            below 1280 it moves into the menu sheet. */}
        <form action="/requests" className="relative hidden 2xl:block">
          <Search
            size={15}
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-[15px] text-fog-veil"
          />
          <input
            type="search"
            name="q"
            placeholder={labels.search}
            aria-label={labels.search}
            className={cn(
              "w-[180px] rounded-[6px] bg-[rgba(199,211,234,0.06)] py-2 pe-3 ps-9 text-[13px] text-pure-white",
              "placeholder:text-[rgba(199,211,234,0.5)] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
              "transition-[width,box-shadow] focus:w-[260px] focus:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.28)] focus:outline-none",
            )}
          />
        </form>

        <Link
          href="/requests"
          className={cn(iconButtonClass, "hidden xl:flex 2xl:hidden")}
          title={labels.search}
          aria-label={labels.search}
        >
          <Search size={17} />
        </Link>

        {canCreate ? (
          <Link
            href="/requests/new"
            className={cn(
              "hidden shrink-0 items-center gap-1.5 rounded-[999px] bg-void-violet px-3.5 py-2 text-[13px] font-medium text-pure-white sm:inline-flex",
              "transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:opacity-90",
            )}
          >
            <PlusCircle size={15} />
            {labels.newRequest}
          </Link>
        ) : null}

        <Link href="/guide" className={iconButtonClass} title={labels.guide} aria-label={labels.guide}>
          <BookOpen size={17} />
        </Link>

        <Link
          href="/notifications"
          className={iconButtonClass}
          title={labels.notifications}
          aria-label={
            unread > 0 ? `${labels.notifications} (${unread})` : labels.notifications
          }
        >
          <Bell size={17} />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -end-0.5 inline-flex min-w-[17px] items-center justify-center rounded-full bg-void-violet px-1 text-[10px] font-medium tabular-nums text-pure-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Link>

        {/* ---------------------------------------------- account */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === "account"}
            aria-label={labels.account}
            onClick={() => setOpenMenu(openMenu === "account" ? null : "account")}
            className={cn(
              "flex items-center gap-2 rounded-[6px] px-2 py-1.5 transition-colors",
              "hover:bg-[rgba(186,214,247,0.06)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.4)]",
            )}
          >
            <UserCircle2 size={20} className="shrink-0 text-moon-mist" />
            <span className="hidden min-w-0 text-start lg:block">
              <span className="block max-w-[140px] truncate text-[13px] leading-tight text-frost-glow">
                {user.name}
              </span>
              <span className="block max-w-[140px] truncate text-[11px] leading-tight text-fog-veil">
                {user.role}
              </span>
            </span>
            <ChevronDown
              size={14}
              className={cn(
                "hidden opacity-60 transition-transform lg:block",
                openMenu === "account" && "rotate-180",
              )}
            />
          </button>

          {openMenu === "account" ? (
            <div
              role="menu"
              className="absolute top-full end-0 z-50 mt-1 min-w-[220px] rounded-[10px] border border-[rgba(186,215,247,0.12)] bg-[rgba(14,14,24,0.98)] p-1 shadow-[0_24px_48px_rgba(6,6,14,0.8)]"
            >
              <div className="border-b border-[rgba(186,215,247,0.12)] px-3 py-2">
                <p className="truncate text-[13px] text-frost-glow">{user.name}</p>
                <p className="truncate text-[11px] text-fog-veil">
                  {user.role} · {user.organization}
                </p>
              </div>
              <Link
                role="menuitem"
                href="/profile"
                className="mt-1 flex items-center gap-2 rounded-[6px] px-3 py-2 text-[14px] text-moon-mist transition-colors hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow"
              >
                <UserCircle2 size={15} className="opacity-70" />
                {labels.profile}
              </Link>
              <Link
                role="menuitem"
                href="/guide"
                className="flex items-center gap-2 rounded-[6px] px-3 py-2 text-[14px] text-moon-mist transition-colors hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow"
              >
                <BookOpen size={15} className="opacity-70" />
                {labels.guide}
              </Link>
              <form action={signOutAction}>
                <button
                  role="menuitem"
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-start text-[14px] text-moon-mist transition-colors hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow"
                >
                  <LogOut size={15} className="opacity-70" />
                  {labels.signOut}
                </button>
              </form>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? labels.closeMenu : labels.openMenu}
          className={cn(iconButtonClass, "xl:hidden")}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* ---------------------------------------------- narrow screens */}
      {mobileOpen ? (
        <div className="border-t border-[rgba(186,215,247,0.12)] bg-[rgba(10,10,18,0.98)] px-[16px] py-[12px] xl:hidden">
          <form action="/requests" className="relative mb-3">
            <Search
              size={15}
              className="pointer-events-none absolute inset-y-0 start-3 my-auto h-[15px] text-fog-veil"
            />
            <input
              type="search"
              name="q"
              placeholder={labels.search}
              aria-label={labels.search}
              className="w-full rounded-[6px] bg-[rgba(199,211,234,0.06)] py-2 pe-3 ps-9 text-[13px] text-pure-white placeholder:text-[rgba(199,211,234,0.5)] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] focus:outline-none"
            />
          </form>
          <nav className="flex flex-col gap-0.5" aria-label="ניווט ראשי">
            {items.map((item) =>
              item.kind === "link" ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className={linkClass(isActive(pathname, item.match))}
                >
                  {item.label}
                </Link>
              ) : (
                <div key={item.id} className="flex flex-col gap-0.5">
                  <p className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-[0.1em] text-fog-veil">
                    {item.label}
                  </p>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(linkClass(pathname === child.href), "ps-6")}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ),
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
