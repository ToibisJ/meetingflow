"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";

import { Button, GlassCard, TextInput } from "@/components/ui/primitives";
import { askLogAction } from "./ask-actions";
import { LOG_ASK_IDLE } from "./ask-state";

/**
 * "Ask George" over the meeting log.
 *
 * Available to every role, because the log it reads is already narrowed to what
 * the person asking is allowed to see.
 */

export function LogAskBar() {
  const [state, submit, asking] = useActionState(askLogAction, LOG_ASK_IDLE);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={16} className="text-[#c0acff]" />
        <h2 className="text-[16px] font-medium text-ice-highlight">שאל את ג׳ורג׳</h2>
        <span className="text-[12.5px] text-fog-veil">
          שאלה על הפגישות שכבר היו. התשובה מגיעה מהלוג שלך בלבד.
        </span>
      </div>

      <form action={submit} className="flex flex-wrap gap-2">
        <TextInput
          name="question"
          defaultValue={state.question}
          placeholder="למשל: מתי נפגשנו לאחרונה עם מריד יאן פיננסים?"
          className="min-w-[240px] flex-1"
        />
        <Button type="submit" disabled={asking} className="px-6">
          {asking ? "חושב" : "שאל"}
        </Button>
      </form>

      {state.status !== "idle" ? (
        <div className="flex flex-col gap-3 rounded-[10px] bg-[rgba(102,58,243,0.07)] p-4 shadow-[inset_0_0_0_1px_rgba(102,58,243,0.2)]">
          {state.answer ? (
            <p className="text-[14px] leading-relaxed text-moon-mist">{state.answer}</p>
          ) : null}

          {state.status === "search" ? (
            <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-[#e8c37a]">
              <Search size={15} className="mt-0.5 shrink-0" />
              <span>
                ג׳ורג׳ לא מחובר למודל כרגע, ולכן הוא לא מנסח תשובה. במקום זה חיפשתי
                בלוג והנה הפגישות שמתאימות לשאלה שלך.
              </span>
            </p>
          ) : null}

          {state.status === "not_found" ? (
            <p className="text-[13.5px] text-[#e8c37a]">
              בלוג שלך אין פגישה שעונה על השאלה הזו.
            </p>
          ) : null}

          {state.status === "no_match" ? (
            <p className="text-[13.5px] text-[#e8c37a]">
              לא מצאתי בלוג פגישה שמתאימה לשאלה. נסה לנסח אותה במילים אחרות, למשל שם
              של איש קשר או של חברה.
            </p>
          ) : null}

          {state.requestNumbers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {state.requestNumbers.map((number) => (
                <Link
                  key={number}
                  href={`/requests/${number}`}
                  className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-3.5 py-1.5 text-[12.5px] text-frost-glow shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
                >
                  בקשה {number}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </GlassCard>
  );
}
