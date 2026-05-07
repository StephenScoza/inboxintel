import path from "path";
import dotenv from "dotenv";

dotenv.config();

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseNumber(process.env.PORT, 3217),
  databaseUrl: requireEnv("DATABASE_URL"),
  gmailAccountEmail: process.env.GMAIL_ACCOUNT_EMAIL ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3217/oauth2callback",
  discordRenewalsWebhook: process.env.DISCORD_RENEWALS_WEBHOOK ?? "",
  discordTrialsWebhook: process.env.DISCORD_TRIALS_WEBHOOK ?? "",
  discordMoneyLeaksWebhook: process.env.DISCORD_MONEY_LEAKS_WEBHOOK ?? "",
  discordOpportunitiesWebhook: process.env.DISCORD_OPPORTUNITIES_WEBHOOK ?? "",
  discordGeneralAlertsWebhook: process.env.DISCORD_GENERAL_ALERTS_WEBHOOK ?? "",
  alertDedupWindowMinutes: parseNumber(process.env.ALERT_DEDUP_WINDOW_MINUTES, 180),
  gmailPageSize: parseNumber(process.env.GMAIL_PAGE_SIZE, 25),
  gmailPollIntervalMs: parseNumber(process.env.GMAIL_POLL_INTERVAL_MS, 300_000),
  tokensDir: path.resolve(process.cwd(), "tokens"),
  webBaseUrl: process.env.WEB_BASE_URL ?? `http://localhost:${parseNumber(process.env.PORT, 3217)}`
};

export function ensureGoogleConfig(): void {
  requireEnv("GOOGLE_CLIENT_ID");
  requireEnv("GOOGLE_CLIENT_SECRET");
  requireEnv("GOOGLE_REDIRECT_URI");
}
