import "server-only";

import type { ConnectionProvider, ConnectionStatus } from "@/generated/prisma/enums";
import type { TenantDb } from "@/lib/tenant";

/**
 * Mail and calendar providers.
 *
 * The integration layer is real: each provider declares the credentials it
 * needs, the scopes it asks for, and where its OAuth flow starts. What is not
 * real yet is a connected account — and rather than showing a button that
 * pretends to work, an unconfigured provider says exactly which environment
 * variables are missing.
 */

export type ProviderDefinition = {
  provider: ConnectionProvider;
  /** Shown as the card title. */
  name: string;
  /** What connecting it will actually enable, in the user's language. */
  capabilities: { he: string; en: string }[];
  /** OAuth scopes requested at consent time. */
  scopes: string[];
  /** Environment variables the server needs before the flow can run. */
  requiredEnv: string[];
  /** Where an administrator creates the credentials. */
  consoleUrl: string;
  /** Redirect URI that must be registered with the provider. */
  redirectPath: string;
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    provider: "GOOGLE",
    name: "Google",
    capabilities: [
      { he: "קריאת דואר נכנס שקשור לפגישות", en: "Read incoming mail related to meetings" },
      { he: "שליחת דואר בשמך", en: "Send mail on your behalf" },
      { he: "קריאת זמינות ביומן", en: "Read calendar availability" },
      { he: "יצירת אירועים ועדכונם", en: "Create and update calendar events" },
    ],
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    redirectPath: "/api/connections/google/callback",
  },
  {
    provider: "MICROSOFT",
    name: "Microsoft 365",
    capabilities: [
      { he: "קריאת דואר נכנס שקשור לפגישות", en: "Read incoming mail related to meetings" },
      { he: "שליחת דואר בשמך", en: "Send mail on your behalf" },
      { he: "קריאת זמינות ביומן", en: "Read calendar availability" },
      { he: "יצירת אירועים ועדכונם", en: "Create and update calendar events" },
    ],
    scopes: ["Mail.Read", "Mail.Send", "Calendars.ReadWrite", "offline_access"],
    requiredEnv: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    consoleUrl: "https://portal.azure.com",
    redirectPath: "/api/connections/microsoft/callback",
  },
];

/** Which required variables are missing on this server, if any. */
export function missingEnv(definition: ProviderDefinition): string[] {
  return definition.requiredEnv.filter((name) => !process.env[name]);
}

export function isConfigured(definition: ProviderDefinition): boolean {
  return missingEnv(definition).length === 0;
}

export type ProviderState = {
  definition: ProviderDefinition;
  status: ConnectionStatus;
  accountEmail: string | null;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  connectedAt: Date | null;
  scopes: string[];
  missingEnv: string[];
};

/** Current state of every provider for one user. */
export async function connectionStates(
  db: TenantDb,
  userId: string,
): Promise<ProviderState[]> {
  const rows = await db.connection.findMany({
    where: { userId },
    // Tokens are deliberately not selected — nothing above this line needs them.
    select: {
      provider: true,
      status: true,
      accountEmail: true,
      lastSyncAt: true,
      lastSyncError: true,
      connectedAt: true,
      scopes: true,
    },
  });

  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return PROVIDERS.map((definition) => {
    const missing = missingEnv(definition);
    const row = byProvider.get(definition.provider);

    const status: ConnectionStatus = missing.length > 0
      ? "NOT_CONFIGURED"
      : (row?.status ?? "DISCONNECTED");

    return {
      definition,
      status,
      accountEmail: row?.accountEmail ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastSyncError: row?.lastSyncError ?? null,
      connectedAt: row?.connectedAt ?? null,
      scopes: row?.scopes ?? [],
      missingEnv: missing,
    };
  });
}
