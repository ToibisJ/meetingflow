import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, GlassCard } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { formatEventTime } from "@/lib/dates";
import { toggleUserAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const ctx = await requireUser();
  if (!can(ctx.session.role, "users:manage")) redirect("/dashboard");

  const t = await getTranslations();

  const users = await ctx.db.user.findMany({
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      jobTitle: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      department: { select: { name: true } },
      manager: { select: { fullName: true } },
      _count: { select: { requestedRequests: true, assignedRequests: true } },
    },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { fullName: "asc" }],
  });

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.users")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          {t("admin.usersTitle")}
        </h1>
      </header>

      <GlassCard>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="text-fog-veil">
                <th className="px-2 pb-3 text-start font-normal">{t("profile.fullName")}</th>
                <th className="px-2 pb-3 text-start font-normal">{t("profile.email")}</th>
                <th className="px-2 pb-3 text-start font-normal">{t("profile.phone")}</th>
                <th className="px-2 pb-3 text-start font-normal">{t("roles.EMPLOYEE")}</th>
                <th className="px-2 pb-3 text-start font-normal">
                  {t("requests.filterDepartment")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">
                  {t("analytics.byEmployee")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">{t("common.never")}</th>
                <th className="px-2 pb-3 text-start font-normal">{t("admin.userActive")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-[rgba(186,215,247,0.12)]">
                  <td className="px-2 py-3">
                    <span className="block text-frost-glow">{user.fullName}</span>
                    <span className="block text-[12px] text-fog-veil">
                      {user.jobTitle ?? "—"}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-moon-mist" dir="ltr">
                    {user.email}
                  </td>
                  <td className="px-2 py-3 text-moon-mist" dir="ltr">
                    {user.phone ?? "—"}
                  </td>
                  <td className="px-2 py-3">
                    <Badge tone={user.role === "ADMIN" ? "ai" : "neutral"}>
                      {t(`roles.${user.role}`)}
                    </Badge>
                  </td>
                  <td className="px-2 py-3 text-moon-mist">
                    {user.department?.name ?? "—"}
                    {user.manager ? (
                      <span className="block text-[12px] text-fog-veil">
                        {user.manager.fullName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-moon-mist">
                    {user._count.requestedRequests} / {user._count.assignedRequests}
                  </td>
                  <td className="px-2 py-3 text-[12px] text-fog-veil">
                    {user.lastLoginAt ? formatEventTime(user.lastLoginAt) : t("common.never")}
                  </td>
                  <td className="px-2 py-3">
                    <form action={toggleUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        disabled={user.id === ctx.session.id}
                        className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-3 py-1.5 text-[12px] text-moon-mist shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:text-frost-glow disabled:opacity-40"
                      >
                        {user.isActive ? t("admin.disable") : t("admin.enable")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
