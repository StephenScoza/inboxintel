import fs from "fs/promises";
import path from "path";
import { google } from "googleapis";
import { config } from "../config";
import { createOAuthClient, loadTokenFromDisk } from "./auth";

async function findTokenFile(): Promise<string> {
  await fs.mkdir(config.tokensDir, { recursive: true });
  const entries = await fs.readdir(config.tokensDir);
  const tokenFiles = entries.filter((entry) => entry.endsWith(".json"));

  if (tokenFiles.length === 0) {
    throw new Error("No Gmail token found. Run `npm run gmail:auth` first.");
  }

  return path.join(config.tokensDir, tokenFiles[0]);
}

export async function getAuthorizedGmailClient() {
  const tokenPath = await findTokenFile();
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

