import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type * as React from "react";

/**
 * The small set of surfaces every screen is built from.
 *
 * Radius families are fixed by the design system and never mixed: buttons are
 * pills, cards are 16px, badges and inputs are 6px. Borders are always the
 * frosted inset hairline, never a solid stroke.
 */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------- surfaces

export function GlassCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[16px] bg-[rgba(186,214,247,0.03)] p-6",
        "shadow-[inset_0_1px_1px_rgba(199,211,234,0.12),inset_0_24px_48px_rgba(199,211,234,0.05),0_24px_32px_rgba(6,6,14,0.7)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[15px] uppercase tracking-[0.1em] text-moon-mist",
        className,
      )}
      style={{ fontFamily: "var(--font-dotdigital)" }}
    >
      {children}
    </p>
  );
}

export function Display({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn("mf-skywash text-[44px] leading-[1.16] font-medium", className)}
      style={{ fontFamily: "var(--font-aeonikpro)" }}
    >
      {children}
    </h1>
  );
}

// ---------------------------------------------------------------- buttons

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[999px] px-4 py-2 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS = {
  ghost: cn(
    "bg-[rgba(186,214,247,0.06)] text-pure-white",
    "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
    "hover:bg-[rgba(186,214,247,0.12)]",
  ),
  outline: cn(
    "bg-transparent text-frost-glow",
    "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
    "hover:bg-[rgba(186,214,247,0.06)]",
  ),
  quiet: "bg-transparent text-fog-veil hover:text-frost-glow",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function Button({
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}
      {...props}
    />
  );
}

/**
 * The single chromatic action in the whole product. The design system reserves
 * Void Violet for the submit button of an auth form — nothing else may use it.
 */
export function SubmitButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex w-full items-center justify-center rounded-[6px] bg-void-violet px-6 py-3",
        "text-[14px] font-medium text-pure-white transition-opacity",
        "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------- inputs

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] text-moon-mist">{label}</span>
      {children}
      {hint ? <span className="text-[12px] text-fog-veil">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5",
        "text-[14px] text-pure-white placeholder:text-[rgba(199,211,234,0.5)]",
        "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
        "focus:shadow-[inset_0_0_0_1px_rgba(186,215,247,0.24)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------- badges

const STATUS_TONES = {
  neutral: "bg-[rgba(199,211,234,0.12)] text-frost-glow",
  ok: "bg-[rgba(38,150,132,0.16)] text-[#7fd7c6]",
  warn: "bg-[rgba(224,168,60,0.16)] text-[#e8c37a]",
  late: "bg-[rgba(224,90,76,0.16)] text-[#f0a094]",
  info: "bg-[rgba(110,168,240,0.16)] text-[#a8caf5]",
  ai: "bg-[rgba(102,58,243,0.18)] text-[#c0acff]",
} as const;

export type BadgeTone = keyof typeof STATUS_TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] font-medium",
        "shadow-[inset_0_0_0_1px_rgba(186,214,247,0.06)]",
        STATUS_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- feedback

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-[18px] text-ice-highlight">{title}</p>
      {hint ? <p className="max-w-[420px] text-[14px] text-fog-veil">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[6px] bg-[rgba(224,90,76,0.12)] px-3 py-2 text-[14px] text-[#f0a094] shadow-[inset_0_0_0_1px_rgba(224,90,76,0.24)]"
    >
      {children}
    </p>
  );
}
