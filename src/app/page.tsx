/**
 * Step 1 placeholder — verifies the design system renders end to end.
 * Replaced by a redirect to /login once authentication exists.
 */
export default function Home() {
  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-[1200px] flex-col items-center justify-center gap-6 px-6 text-center">
      <p
        className="text-[15px] uppercase tracking-[0.1em] text-moon-mist"
        style={{ fontFamily: "var(--font-dotdigital)" }}
      >
        Coordination, measured
      </p>

      <h1
        className="mf-skywash text-[64px] leading-[1.1] font-medium sm:text-[96px]"
        style={{ fontFamily: "var(--font-aeonikpro)" }}
      >
        MeetingFlow
      </h1>

      <p className="max-w-[640px] text-[18px] leading-[1.5] text-moon-mist">
        מקור אמת אחד לכל תהליך תיאום הפגישות והשיחות בארגון — בקשה, תיאום, מעקב,
        ביצוע וסיכום.
      </p>

      <div className="mt-6 grid w-full max-w-[900px] gap-4 sm:grid-cols-3">
        {[
          { title: "העובד", body: "לא צריך לרדוף אחרי המתאם" },
          { title: "המתאם", body: "לא צריך לזכור למי כבר התקשר" },
          { title: "המנהל", body: "לא צריך לשאול מה תקוע" },
        ].map((card) => (
          <div key={card.title} className="mf-glass p-6 text-right">
            <h2 className="text-[18px] font-medium text-ice-highlight">
              {card.title}
            </h2>
            <p className="mt-2 text-[14px] leading-[1.43] text-fog-veil">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
