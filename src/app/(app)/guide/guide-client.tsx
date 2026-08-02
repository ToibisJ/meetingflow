"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Search, Sparkles } from "lucide-react";

import { Button, GlassCard, TextInput, cn } from "@/components/ui/primitives";
import { GUIDE, type Block, type Section } from "./content";
import { askGeorgeAction } from "./ask-actions";
import { ASK_IDLE } from "./ask-state";

/**
 * The guide.
 *
 * Left in the reading flow: a table of contents that follows the scroll and
 * tracks what you have already read. Right: the sections themselves. At the top:
 * a question bar that answers from the guide's own text.
 *
 * Progress is stored in this browser only — it is a reading aid, not a record.
 */

const STORAGE_KEY = "mf-guide-read";

const ALL_SECTIONS: Section[] = GUIDE.flatMap((chapter) => chapter.sections);

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return <p className="text-[14.5px] leading-relaxed text-moon-mist">{block.text}</p>;

    case "list":
      return (
        <ul className="flex flex-col gap-2">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-moon-mist">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#6ea8f0]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="flex flex-col gap-2.5">
          {block.items.map((item, index) => (
            <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-moon-mist">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(102,58,243,0.2)] text-[11px] font-medium tabular-nums text-[#c0acff]"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case "note": {
      const tone = {
        info: "bg-[rgba(110,168,240,0.08)] shadow-[inset_0_0_0_1px_rgba(110,168,240,0.24)] text-[#a8caf5]",
        warn: "bg-[rgba(224,168,60,0.08)] shadow-[inset_0_0_0_1px_rgba(224,168,60,0.24)] text-[#e8c37a]",
        ai: "bg-[rgba(102,58,243,0.08)] shadow-[inset_0_0_0_1px_rgba(102,58,243,0.24)] text-[#c0acff]",
      }[block.tone];

      return (
        <div className={cn("flex flex-col gap-1.5 rounded-[10px] p-4", tone)}>
          <p className="text-[13.5px] font-medium">{block.title}</p>
          <p className="text-[13.5px] leading-relaxed text-moon-mist">{block.text}</p>
        </div>
      );
    }

    case "table":
      return (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="text-fog-veil">
                {block.head.map((cell) => (
                  <th key={cell} className="px-2 pb-2.5 text-start font-medium">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]} className="border-t border-[rgba(186,215,247,0.12)]">
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      className={cn(
                        "px-2 py-2.5 align-top leading-relaxed",
                        index === 0 ? "text-frost-glow" : "text-moon-mist",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "try":
      return (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-[rgba(186,214,247,0.04)] p-3 shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]">
          <Link
            href={block.href}
            className="inline-flex items-center gap-2 rounded-[999px] bg-void-violet px-4 py-2 text-[13px] font-medium text-pure-white hover:opacity-90"
          >
            {block.label}
            <ArrowLeft size={14} className="rtl:rotate-0 ltr:rotate-180" />
          </Link>
          {block.text ? (
            <span className="text-[13px] text-fog-veil">{block.text}</span>
          ) : null}
        </div>
      );
  }
}

export function GuideClient() {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string>(ALL_SECTIONS[0].id);
  const [askState, askAction, asking] = useActionState(askGeorgeAction, ASK_IDLE);

  // Restore reading progress from this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRead(new Set(JSON.parse(saved) as string[]));
    } catch {
      /* private mode — progress simply is not remembered */
    }
  }, []);

  const toggleRead = (id: string) => {
    setRead((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Highlight the section currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );

    ALL_SECTIONS.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const progress = useMemo(
    () => Math.round((read.size / ALL_SECTIONS.length) * 100),
    [read],
  );

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      {/* ------------------------------------------------------ ask George */}
      <GlassCard className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#c0acff]" />
          <h2 className="text-[16px] font-medium text-ice-highlight">שאל את ג׳ורג׳</h2>
          <span className="text-[12.5px] text-fog-veil">
            שאלה על כל פונקציה במערכת. התשובה מגיעה מהמדריך הזה בלבד.
          </span>
        </div>

        <form action={askAction} className="flex flex-wrap gap-2">
          <TextInput
            name="question"
            defaultValue={askState.question}
            placeholder="למשל: מה קורה אחרי שהפגישה מסתיימת?"
            className="min-w-[240px] flex-1"
          />
          <Button type="submit" disabled={asking} className="px-6">
            {asking ? "חושב" : "שאל"}
          </Button>
        </form>

        {askState.status !== "idle" ? (
          <div className="flex flex-col gap-3 rounded-[10px] bg-[rgba(102,58,243,0.07)] p-4 shadow-[inset_0_0_0_1px_rgba(102,58,243,0.2)]">
            {askState.answer ? (
              <p className="text-[14px] leading-relaxed text-moon-mist">{askState.answer}</p>
            ) : null}

            {askState.status === "search" ? (
              <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-[#e8c37a]">
                <Search size={15} className="mt-0.5 shrink-0" />
                <span>
                  ג׳ורג׳ לא מחובר למודל כרגע, ולכן הוא לא מנסח תשובה. במקום זה חיפשתי במדריך
                  והנה הפרקים שמתאימים לשאלה שלך.
                </span>
              </p>
            ) : null}

            {askState.status === "not_in_guide" ? (
              <p className="text-[13.5px] text-[#e8c37a]">
                המדריך לא מכיל תשובה לשאלה הזו. אם זה משהו שהמערכת אמורה לעשות, שווה לשאול.
              </p>
            ) : null}

            {askState.status === "no_match" ? (
              <p className="text-[13.5px] text-[#e8c37a]">
                לא מצאתי במדריך פרק שמתאים לשאלה. נסה לנסח אותה במילים אחרות.
              </p>
            ) : null}

            {askState.sectionIds.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {askState.sectionIds.map((id) => {
                  const section = ALL_SECTIONS.find((item) => item.id === id);
                  if (!section) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => jump(id)}
                      className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-3.5 py-1.5 text-[12.5px] text-frost-glow shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
                    >
                      {section.title}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ------------------------------------------------ table of contents */}
        {/* Offset clears the fixed top bar (64px) plus the page gutter. */}
        <aside className="lg:sticky lg:top-[88px] lg:h-[calc(100vh-112px)] lg:overflow-y-auto">
          <GlassCard className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-moon-mist">התקדמות בלימוד</span>
                <span className="text-[13px] tabular-nums text-frost-glow">{progress}%</span>
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-[rgba(186,215,247,0.1)]">
                <span
                  className="block h-full rounded-full bg-[#663af3] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="text-[11.5px] text-fog-veil">
                {read.size} מתוך {ALL_SECTIONS.length} פרקים
              </span>
            </div>

            <nav className="flex flex-col gap-4">
              {GUIDE.map((chapter) => (
                <div key={chapter.id} className="flex flex-col gap-1">
                  <p
                    className="px-1 pb-1 text-[11px] uppercase tracking-[0.1em] text-fog-veil"
                    style={{ fontFamily: "var(--font-dotdigital)" }}
                  >
                    {chapter.title}
                  </p>

                  {chapter.sections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => jump(section.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-start text-[13px] transition-colors",
                        active === section.id
                          ? "bg-[rgba(102,58,243,0.16)] text-[#c0acff]"
                          : "text-moon-mist hover:bg-[rgba(186,214,247,0.06)] hover:text-frost-glow",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]",
                          read.has(section.id)
                            ? "bg-[#269684] text-[#05060f]"
                            : "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.2)]",
                        )}
                        aria-hidden="true"
                      >
                        {read.has(section.id) ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{section.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </GlassCard>
        </aside>

        {/* ---------------------------------------------------------- content */}
        <div className="flex min-w-0 flex-col gap-6">
          {GUIDE.map((chapter) => (
            <section key={chapter.id} className="flex flex-col gap-6">
              <h2
                className="text-[13px] uppercase tracking-[0.1em] text-fog-veil"
                style={{ fontFamily: "var(--font-dotdigital)" }}
              >
                {chapter.title}
              </h2>

              {chapter.sections.map((section) => (
                <GlassCard
                  key={section.id}
                  id={section.id}
                  className="flex scroll-mt-[88px] flex-col gap-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[20px] font-medium text-ice-highlight">
                        {section.title}
                      </h3>
                      <p className="text-[13px] text-fog-veil">{section.summary}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleRead(section.id)}
                      aria-pressed={read.has(section.id)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-[999px] px-3.5 py-1.5 text-[12.5px] transition-colors",
                        read.has(section.id)
                          ? "bg-[rgba(38,150,132,0.18)] text-[#7fd7c6]"
                          : "bg-[rgba(186,214,247,0.05)] text-moon-mist shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:text-frost-glow",
                      )}
                    >
                      <Check size={13} />
                      {read.has(section.id) ? "נלמד" : "סמן כנלמד"}
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    {section.blocks.map((block, index) => (
                      <BlockView key={index} block={block} />
                    ))}
                  </div>
                </GlassCard>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
