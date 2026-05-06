import { prisma } from "../db";
import { config } from "../config";
import {
  fetchEmailsInPages,
  fetchHistoryInPages,
  GmailMessagePage,
  GmailHistoryExpiredError
} from "../gmail/fetchEmails";
import { getAuthorizedGmailClient } from "../gmail/client";
import { logger } from "../utils/logger";
import { processEmail } from "./processEmail";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runIngestOnce(maxPages?: number, forceFullSync = false) {
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
  let pageCount = 0;

  const processPages = async (pages: AsyncGenerator<GmailMessagePage>) => {
    for await (const page of pages) {
      pageCount += 1;
      logger.info("Processing Gmail page", {
        pageCount,
        messageCount: page.messages.length
      });

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
    if (existingAccount?.historyId && !forceFullSync) {
      usedIncrementalSync = true;
      await processPages(fetchHistoryInPages(client.gmail, existingAccount.historyId, { maxPages }));
    } else {
      await processPages(fetchEmailsInPages(client.gmail, { maxPages }));
    }
  } catch (error) {
    if (!(error instanceof GmailHistoryExpiredError)) {
      logger.error("Ingest failed before fallback", {
        error: error instanceof Error ? error.message : "Unknown ingest error"
      });
      throw error;
    }

    usedIncrementalSync = false;
    logger.warn("Gmail history expired, falling back to full mailbox sync", {
      existingHistoryId: existingAccount?.historyId ?? null
    });
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
  logger.info("Ingest completed", {
    mode: modeLabel,
    processed,
    duplicates,
    pageCount
  });
  console.log(`Ingest complete via ${modeLabel}. New emails: ${processed}. Duplicates skipped: ${duplicates}.`);
}

async function runWorkerLoop(maxPages?: number, forceFullSync = false) {
  while (true) {
    try {
      await runIngestOnce(maxPages, forceFullSync);
    } catch (error) {
      logger.error("Worker iteration failed", {
        error: error instanceof Error ? error.message : "Unknown worker error"
      });
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
  const forceFullSync = process.argv.includes("--full-sync");

  const runner = loop ? runWorkerLoop(maxPages, forceFullSync) : runIngestOnce(maxPages, forceFullSync);
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
