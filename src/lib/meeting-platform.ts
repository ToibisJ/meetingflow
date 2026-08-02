/**
 * Which video platform a meeting link belongs to.
 *
 * Derived from the link rather than stored alongside it, on purpose: a stored
 * platform can disagree with the link it describes, and then the badge says
 * Zoom while the button opens Teams. Reading the link cannot drift.
 *
 * Recognising a platform is presentation only. An unrecognised link is still a
 * perfectly good link and still gets a join button — it just says "קישור" and
 * shows the host, so nothing is ever swallowed for not being on the list.
 */

export type MeetingPlatformKey =
  | "ZOOM"
  | "GOOGLE_MEET"
  | "TEAMS"
  | "WEBEX"
  | "WHEREBY"
  | "OTHER";

export type MeetingPlatform = {
  key: MeetingPlatformKey;
  /** Display name in Hebrew, matching how people actually say it. */
  label: string;
  /** Brand hue, used for the small dot only. Never as a surface. */
  tint: string;
};

const PLATFORMS: { key: MeetingPlatformKey; label: string; tint: string; hosts: RegExp }[] = [
  { key: "ZOOM", label: "זום", tint: "#4a8cff", hosts: /(^|\.)zoom\.(us|com|com\.cn)$/i },
  { key: "GOOGLE_MEET", label: "Google Meet", tint: "#00ac47", hosts: /(^|\.)meet\.google\.com$/i },
  { key: "TEAMS", label: "Teams", tint: "#6264a7", hosts: /(^|\.)teams\.(microsoft|live)\.com$/i },
  { key: "WEBEX", label: "Webex", tint: "#00bceb", hosts: /(^|\.)webex\.com$/i },
  { key: "WHEREBY", label: "Whereby", tint: "#f5c26b", hosts: /(^|\.)whereby\.com$/i },
];

const UNKNOWN: MeetingPlatform = { key: "OTHER", label: "קישור", tint: "#9da7ba" };

/** Null when there is no usable link at all. */
export function detectPlatform(url: string | null | undefined): MeetingPlatform | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  let host: string;
  try {
    // A link pasted without a scheme is still a link; assume https.
    host = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return UNKNOWN;
  }

  const match = PLATFORMS.find((platform) => platform.hosts.test(host));
  if (match) return { key: match.key, label: match.label, tint: match.tint };

  return { ...UNKNOWN, label: host.replace(/^www\./, "") };
}

/** The href to put on a join button — always absolute, so it opens. */
export function joinHref(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
