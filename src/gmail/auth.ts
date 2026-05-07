import fs from "fs/promises";
import path from "path";
import readline from "readline/promises";
import { google } from "googleapis";
import { config, ensureGoogleConfig } from "../config";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

type StoredTokenPayload = Record<string, unknown>;

interface StoredTokenEnvelope {
  email?: string;
  token: StoredTokenPayload;
}

export function createOAuthClient() {
  ensureGoogleConfig();

  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );
}

export function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
}

export function getTokenPath(email: string): string {
  return path.join(config.tokensDir, `${sanitizeFilename(email)}.json`);
}

export async function saveToken(email: string, token: unknown): Promise<string> {
  await fs.mkdir(config.tokensDir, { recursive: true });
  const tokenPath = getTokenPath(email);
  const envelope: StoredTokenEnvelope = {
    email,
    token: (token ?? {}) as StoredTokenPayload
  };
  await fs.writeFile(tokenPath, JSON.stringify(envelope, null, 2), "utf8");
  return tokenPath;
}

export async function loadTokenFromDisk(tokenPath: string) {
  const raw = await fs.readFile(tokenPath, "utf8");
  const parsed = JSON.parse(raw) as StoredTokenPayload | StoredTokenEnvelope;
  if (
    parsed &&
    typeof parsed === "object" &&
    "token" in parsed &&
    parsed.token &&
    typeof parsed.token === "object"
  ) {
    return parsed.token;
  }

  return parsed;
}

async function loadStoredTokenEnvelope(tokenPath: string, fallbackEmail: string): Promise<StoredTokenEnvelope> {
  const raw = await fs.readFile(tokenPath, "utf8");
  const parsed = JSON.parse(raw) as StoredTokenPayload | StoredTokenEnvelope;

  if (
    parsed &&
    typeof parsed === "object" &&
    "token" in parsed &&
    parsed.token &&
    typeof parsed.token === "object"
  ) {
    return {
      email: typeof parsed.email === "string" && parsed.email ? parsed.email : fallbackEmail,
      token: parsed.token as StoredTokenPayload
    };
  }

  return {
    email: fallbackEmail,
    token: (parsed ?? {}) as StoredTokenPayload
  };
}

async function resolveCanonicalTokenAccount(entryName: string, tokenPath: string): Promise<{ email: string; tokenPath: string }> {
  const fallbackEmail = entryName.replace(/\.json$/i, "");
  const envelope = await loadStoredTokenEnvelope(tokenPath, fallbackEmail);
  let canonicalEmail = envelope.email ?? fallbackEmail;
  let canonicalTokenPath = tokenPath;

  try {
    const oauthClient = createOAuthClient();
    oauthClient.setCredentials(envelope.token);
    const gmail = google.gmail({ version: "v1", auth: oauthClient });
    const profile = await gmail.users.getProfile({ userId: "me" });
    canonicalEmail = profile.data.emailAddress ?? canonicalEmail;
  } catch {
    canonicalEmail = envelope.email ?? canonicalEmail;
  }

  const expectedTokenPath = getTokenPath(canonicalEmail);
  if (expectedTokenPath !== tokenPath) {
    const nextEnvelope: StoredTokenEnvelope = {
      email: canonicalEmail,
      token: envelope.token
    };

    await fs.writeFile(expectedTokenPath, JSON.stringify(nextEnvelope, null, 2), "utf8");
    await fs.rm(tokenPath, { force: true });
    canonicalTokenPath = expectedTokenPath;
  } else if (envelope.email !== canonicalEmail) {
    const nextEnvelope: StoredTokenEnvelope = {
      email: canonicalEmail,
      token: envelope.token
    };
    await fs.writeFile(tokenPath, JSON.stringify(nextEnvelope, null, 2), "utf8");
  }

  return {
    email: canonicalEmail,
    tokenPath: canonicalTokenPath
  };
}

export async function listTokenAccounts(): Promise<Array<{ email: string; tokenPath: string }>> {
  await fs.mkdir(config.tokensDir, { recursive: true });
  const entries = await fs.readdir(config.tokensDir);

  const resolvedAccounts = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => resolveCanonicalTokenAccount(entry, path.join(config.tokensDir, entry)))
  );

  return resolvedAccounts.sort((left, right) => left.email.localeCompare(right.email));
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

export async function runListAccounts(): Promise<void> {
  const accounts = await listTokenAccounts();

  if (accounts.length === 0) {
    console.log("No Gmail token files found.");
    return;
  }

  for (const account of accounts) {
    console.log(`${account.email} -> ${account.tokenPath}`);
  }
}

if (require.main === module) {
  const runner = process.argv.includes("--list") ? runListAccounts() : runOAuthFlow();
  runner.catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
