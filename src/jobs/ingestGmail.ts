import { prisma } from "../db";
import { config } from "../config";
import {
  fetchEmailsInPages,
  fetchHistoryInPages,
  GmailMessagePage,
  GmailHistoryExpiredError
} from "../gmail/fetchEmails";
import { getAuthorizedGmailClient } from "../gmail/client";
import { processEmail } from "./processEmail";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runIngestOnce(maxPages?: number) {
  const client = await getAuthorizedGmailClient();
  const existingAccount = await prisma.gmailAccount.findUnique({
    where: { email: client.emailAddress }
  });

  const account = await prisma.gmailAccount.upsert({
    where: { email: client.emailAddress },
    update: {
      tokenPath: client.tokenPath,
      lastSyncedAt: new Date()
    },
    create: {
      email: client.emailAddress,
      tokenPath: client.tokenPath,
      historyId: client.historyId,
      lastSyncedAt: new Date()
    }
  });

  let processed = 0;
  let duplicates = 0;
  let latestHistoryId = client.historyId ?? existingAccount?.historyId ?? account.historyId;
  let usedIncrementalSync = false;

  const processPages = async (pages: AsyncGenerator<GmailMessagePage>) => {
    for await (const page of pages) {
      if (page.historyId) {
        latestHistoryId = page.historyId;
      }

      for (const message of page.messages) {
        const result = await processEmail(message, {
          gmailAccountId: account.id,
          gmailAccountEmail: account.email
        });

        if (result.skipped) {
          if (result.reason === "duplicate") {
            duplicates += 1;
          }
          continue;
        }

        processed += 1;
      }
    }
  };

  try {
    if (existingAccount?.historyId) {
      usedIncrementalSync = true;
      await processPages(fetchHistoryInPages(client.gmail, existingAccount.historyId, { maxPages }));
    } else {
      await processPages(fetchEmailsInPages(client.gmail, { maxPages }));
    }
  } catch (error) {
    if (!(error instanceof GmailHistoryExpiredError)) {
      throw error;
    }

    usedIncrementalSync = false;
    await processPages(fetchEmailsInPages(client.gmail, { maxPages }));
  }

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: {
      historyId: latestHistoryId,
      lastSyncedAt: new Date()
    }
  });

  const modeLabel = usedIncrementalSync ? "incremental history sync" : "full mailbox sync";
  console.log(`Ingest complete via ${modeLabel}. New emails: ${processed}. Duplicates skipped: ${duplicates}.`);
}

async function runWorkerLoop(maxPages?: number) {
  while (true) {
    try {
      await runIngestOnce(maxPages);
    } catch (error) {
      console.error("Worker iteration failed:", error);
    }

    console.log(`Sleeping for ${config.gmailPollIntervalMs}ms`);
    await sleep(config.gmailPollIntervalMs);
  }
}

if (require.main === module) {
  const maxPagesFlag = process.argv.find((arg) => arg.startsWith("--max-pages="));
  const maxPages = maxPagesFlag ? Number(maxPagesFlag.split("=")[1]) : undefined;
  const loop = process.argv.includes("--loop");

  const runner = loop ? runWorkerLoop(maxPages) : runIngestOnce(maxPages);
  runner
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      if (!loop) {
        await prisma.$disconnect();
      }
    });
}
