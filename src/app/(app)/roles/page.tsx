import { getTranslations } from "next-intl/server";
import { Eye, Lock, ShieldCheck } from "lucide-react";

import { Badge, Eyebrow, GlassCard, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { canPreview, ROLE_ORDER } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import type { Role } from "@/generated/prisma/enums";
import { enterPreviewAction, leavePreviewAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Who sees what, and a way to go and look.
 *
 * The screen is open to everybody on purpose. A level that may not preview
 * still gets the explanation of every role — it just gets told, in as many
 * words, that entering is not open to it.
 */

const SUMMARY: Record<Role, { what: string; sees: string }> = {
  DEVELOPER: {
    what: "הרשאת פיתוח. רואה הכול, ויכולה להיכנס לתצוגה של כל תפקיד אחר כדי לבדוק איך המערכת נראית מהצד שלו.",
    sees: "הכול, בכל הארגון, ובנוסף תצוגת תפקידים",
  },
  ADMIN: {
    what: "מנהל המערכת. אחראי על המשתמשים, ההגדרות ויומן הביקורת. לא מתאם פגישות בעצמו.",
    sees: "כל הבקשות בארגון, ניהול משתמשים, הגדרות ויומן ביקורת",
  },
  MANAGER: {
    what: "מנהל. רואה את התמונה של הצוות שלו — מה פתוח, מה תקוע ומי לא עונה.",
    sees: "הבקשות שלו ושל הכפופים לו, וניתוח נתונים מלא",
  },
  COORDINATOR: {
    what: "המתאם. זה מי שקובע את הפגישות בפועל: לוקח בקשה, יוצר קשר, מתעד כל ניסיון, קובע מועד וכותב סיכום.",
    sees: "כל הבקשות בארגון, אנשי הקשר, ושלוש עשרה פעולות התיאום",
  },
  EMPLOYEE: {
    what: "העובד. הוא זה שמבקש שיתאמו לו פגישה, ועוקב אחרי מה שקורה איתה.",
    sees: "רק הבקשות שהוא פתח ופגישות שהוא משתתף בהן",
  },
};

export default async function RolesPage() {
  const ctx = await requireUser();
  const t = await getTranslations();

  // The permission belongs to whoever is really signed in, never to the face
  // currently being worn.
  const real = await getSession();
  const viewerRole: Role = real?.role ?? ctx.session.role;

  const people = await ctx.db.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, email: true, role: true, jobTitle: true },
    orderBy: { fullName: "asc" },
  });

  const byRole = new Map<Role, typeof people>();
  for (const role of ROLE_ORDER) byRole.set(role, []);
  for (const person of people) byRole.get(person.role)?.push(person);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>תצוגת תפקידים</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          איך המערכת נראית לכל אחד
        </h1>
        <p className="max-w-[680px] text-[14px] leading-relaxed text-fog-veil">
          לכל תפקיד יש תמונה אחרת של אותם נתונים. כאן כתוב מה כל תפקיד רואה, ומי
          במערכת נמצא בו. אם ההרשאה שלך מאפשרת, אפשר להיכנס ולראות את המסכים
          בדיוק כמו שהם נראים לו.
        </p>
      </header>

      {ctx.preview ? (
        <GlassCard className="flex flex-wrap items-center justify-between gap-4 border border-[rgba(102,58,243,0.4)]">
          <div className="flex flex-col gap-1">
            <p className="text-[15px] text-frost-glow">
              אתה צופה עכשיו כ{ctx.session.fullName} · {t(`roles.${ctx.session.role}`)}
            </p>
            <p className="text-[13px] text-fog-veil">
              התצוגה לקריאה בלבד. שום פעולה לא תישמר כל עוד היא פועלת.
            </p>
          </div>
          <form action={leavePreviewAction}>
            <button
              type="submit"
              className="rounded-[999px] bg-void-violet px-4 py-2 text-[13px] font-medium text-pure-white transition-opacity hover:opacity-90"
            >
              חזרה לעצמי
            </button>
          </form>
        </GlassCard>
      ) : null}

      <div className="flex flex-col gap-4">
        {ROLE_ORDER.map((role) => {
          const allowed = canPreview(viewerRole, role);
          const members = byRole.get(role) ?? [];
          const isMine = viewerRole === role;

          return (
            <GlassCard key={role} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[18px] font-medium text-ice-highlight">
                      {t(`roles.${role}`)}
                    </h2>
                    {isMine ? <Badge tone="info">התפקיד שלך</Badge> : null}
                  </div>
                  <p className="max-w-[640px] text-[14px] leading-relaxed text-moon-mist">
                    {SUMMARY[role].what}
                  </p>
                  <p className="text-[13px] text-fog-veil">
                    רואה: {SUMMARY[role].sees}
                  </p>
                </div>

                {allowed ? (
                  <Badge tone="ai">
                    <Eye size={13} />
                    אפשר להיכנס
                  </Badge>
                ) : (
                  <Badge tone="neutral">
                    <Lock size={13} />
                    אין לך הרשאה
                  </Badge>
                )}
              </div>

              {allowed ? (
                members.length === 0 ? (
                  <p className="text-[13px] text-fog-veil">
                    אין כרגע אף אחד בתפקיד הזה בארגון.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {members.map((person) => (
                      <li
                        key={person.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] px-2 py-2 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                      >
                        <span className="min-w-0">
                          <span className="block text-[14px] text-frost-glow">
                            {person.fullName}
                          </span>
                          <span className="block text-[12px] text-fog-veil">
                            {person.jobTitle ? `${person.jobTitle} · ` : ""}
                            {person.email}
                          </span>
                        </span>
                        {person.id === ctx.session.id ? (
                          <span className="text-[12px] text-fog-veil">זו התצוגה הנוכחית</span>
                        ) : (
                          <form action={enterPreviewAction}>
                            <input type="hidden" name="userId" value={person.id} />
                            <button
                              type="submit"
                              className={cn(
                                "rounded-[999px] bg-[rgba(186,214,247,0.06)] px-3.5 py-1.5 text-[13px] text-frost-glow",
                                "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] transition-colors hover:bg-[rgba(186,214,247,0.12)]",
                              )}
                            >
                              כניסה כ{person.fullName.split(" ")[0]}
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="flex items-center gap-2 rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[13.5px] text-moon-mist">
                  <ShieldCheck size={15} className="shrink-0 opacity-60" />
                  אין לך הרשאה להיכנס לתצוגה של {t(`roles.${role}`)}. אפשר להיכנס רק
                  לתפקידים ברמה שלך ומטה, ורק עם הרשאת מפתח.
                </p>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
