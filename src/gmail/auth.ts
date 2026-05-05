import fs from "fs/promises";
import path from "path";
import readline from "readline/promises";
import { google } from "googleapis";
import { config, ensureGoogleConfig } from "../config";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function createOAuthClient() {
  ensureGoogleConfig();

  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
}

export function getTokenPath(email: string): string {
  return path.join(config.tokensDir, `${sanitizeFilename(email)}.json`);
}

export async function saveToken(email: string, token: unknown): Promise<string> {
  await fs.mkdir(config.tokensDir, { recursive: true });
  const tokenPath = getTokenPath(email);
  await fs.writeFile(tokenPath, JSON.stringify(token, null, 2), "utf8");
  return tokenPath;
}

export async function loadTokenFromDisk(tokenPath: string) {
  const raw = await fs.readFile(tokenPath, "utf8");
  return JSON.parse(raw);
}

async function exchangeCodeForToken(code: string) {
  const oauthClient = createOAuthClient();
  const tokenResponse = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokenResponse.tokens);

  const gmail = google.gmail({ version: "v1", auth: oauthClient });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;

  if (!email) {
    throw new Error("Google OAuth succeeded, but Gmail profile email was missing.");
  }

  const tokenPath = await saveToken(email, tokenResponse.tokens);
  return { email, tokenPath };
}

export async function runOAuthFlow(): Promise<void> {
  const oauthClient = createOAuthClient();
  const consentUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE]
  });

  console.log("Open this URL to authorize InboxIntel:");
  console.log(consentUrl);
  console.log("");
  console.log(`After Google redirects to ${config.googleRedirectUri}, copy the full URL from your browser and paste it here.`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const redirectInput = (await rl.question("Paste redirect URL or authorization code: ")).trim();
    const code = redirectInput.startsWith("http")
      ? new URL(redirectInput).searchParams.get("code")
      : redirectInput;

    if (!code) {
      throw new Error("No authorization code detected in the pasted value.");
    }

    const result = await exchangeCodeForToken(code);
    console.log(`Saved token for ${result.email} at ${result.tokenPath}`);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  runOAuthFlow().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
