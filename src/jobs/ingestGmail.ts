import { prisma } from "../db";
import { config } from "../config";
import { fetchEmailsInPages } from "../gmail/fetchEmails";
import { getAuthorizedGmailClient } from "../gmail/client";
import { processEmail } from "./processEmail";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runIngestOnce(maxPages?: number) {
  const client = await getAuthorizedGmailClient();
  const account = await prisma.gmailAccount.upsert({
    where: { email: client.emailAddress },
    update: {
      tokenPath: client.tokenPath,
      historyId: client.historyId,
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

  for await (const page of fetchEmailsInPages(client.gmail, { maxPages })) {
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

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: {
      lastSyncedAt: new Date()
    }
  });

  console.log(`Ingest complete. New emails: ${processed}. Duplicates skipped: ${duplicates}.`);
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

