import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono, Heebo } from "next/font/google";
import "./globals.css";

/**
 * Fonts follow DESIGN.md substitutions:
 *   Untitled Sans -> Inter   (body, UI)
 *   aeonikPro     -> Space Grotesk (display headings)
 *   dotDigital    -> JetBrains Mono (all-caps eyebrow labels)
 * Heebo carries the Hebrew glyphs the three Latin faces do not cover.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MeetingFlow",
  description:
    "מערכת לניהול ותיאום פגישות ושיחות — בקשה, תיאום, מעקב, ביצוע וסיכום במקום אחד",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${heebo.variable}`}
      style={
        {
          "--font-untitled-sans": "var(--font-inter), var(--font-heebo), system-ui, sans-serif",
          "--font-aeonikpro":
            "var(--font-space-grotesk), var(--font-heebo), system-ui, sans-serif",
          "--font-dotdigital":
            "var(--font-jetbrains-mono), var(--font-heebo), ui-monospace, monospace",
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <body className="mf-atmosphere">{children}</body>
    </html>
  );
}
