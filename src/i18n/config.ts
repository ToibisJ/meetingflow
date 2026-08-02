export const LOCALES = ["he", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "he";

/** Text direction per locale — drives the `dir` attribute on <html>. */
export const DIRECTION: Record<AppLocale, "rtl" | "ltr"> = {
  he: "rtl",
  en: "ltr",
};

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
