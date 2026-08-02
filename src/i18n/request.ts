import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { DEFAULT_LOCALE, isAppLocale } from "./config";

export const LOCALE_COOKIE = "mf_locale";

/**
 * Locale is a user preference, not a URL segment — this is a signed-in product,
 * so there are no locale-prefixed public routes. The preference is mirrored into
 * a cookie on sign-in so that server components can read it without a database
 * round trip.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isAppLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
