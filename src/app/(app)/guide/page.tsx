import { Eyebrow } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { GuideClient } from "./guide-client";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  // Signed-in only: the guide describes what this organization's data looks like.
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>MeetingFlow</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">מדריך המערכת</h1>
        <p className="max-w-[640px] text-[14px] leading-relaxed text-fog-veil">
          כל מסך וכל פונקציה, מוסברים לפי הסדר. אפשר לקרוא מההתחלה, לקפוץ לפרק
          מהתפריט, או לשאול את ג׳ורג׳ שאלה ולהגיע ישר לתשובה. סימון פרק כנלמד נשמר
          בדפדפן הזה, כדי שתוכל לחזור ולהמשיך מאיפה שהפסקת.
        </p>
      </header>

      <GuideClient />
    </div>
  );
}
