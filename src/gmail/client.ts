import fs from "fs/promises";
import path from "path";
import { google } from "googleapis";
import { config } from "../config";
import { createOAuthClient, listTokenAccounts, loadTokenFromDisk } from "./auth";

interface AuthorizedClientOptions {
  accountEmail?: string;
}

async function findTokenFile(accountEmail?: string): Promise<string> {
  const requestedEmail = (accountEmail ?? config.gmailAccountEmail).trim().toLowerCase();
  const tokenAccounts = await listTokenAccounts();

  if (tokenAccounts.length === 0) {
    throw new Error("No Gmail token found. Run `npm run gmail:auth` first.");
  }

  if (requestedEmail) {
    const matched = tokenAccounts.find((entry) => entry.email.toLowerCase() === requestedEmail);
    if (!matched) {
      throw new Error(`No Gmail token found for ${requestedEmail}. Run \`npm run gmail:auth\` for that account first.`);
    }

    return matched.tokenPath;
  }

  if (tokenAccounts.length > 1) {
    throw new Error(
      `Multiple Gmail token files found. Set GMAIL_ACCOUNT_EMAIL or pass --account=<email>. Available: ${tokenAccounts.map((entry) => entry.email).join(", ")}`
    );
  }

  return tokenAccounts[0].tokenPath;
}

export async function getAuthorizedGmailClient(options: AuthorizedClientOptions = {}) {
  const tokenPath = await findTokenFile(options.accountEmail);
  const oauthClient = createOAuthClient();
  const token = await loadTokenFromDisk(tokenPath);
  oauthClient.setCredentials(token);

  const gmail = google.gmail({ version: "v1", auth: oauthClient });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const emailAddress = profile.data.emailAddress;

  if (!emailAddress) {
    throw new Error("Authenticated Gmail account does not expose an email address.");
  }

  return {
    gmail,
    oauthClient,
    tokenPath,
    emailAddress,
    historyId: profile.data.historyId ?? null
  };
}
