import { Prisma, SyncRunMode, SyncRunStatus } from "@prisma/client";
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

export interface IngestRunResult {
  processed: number;
  duplicates: number;
  pageCount: number;
  pageOffset: number;
  latestHistoryId: string | null;
  nextPageToken: string | null;
  usedIncrementalSync: boolean;
  mode: SyncRunMode;
  syncRunId: string;
}

export async function runIngestOnce(
  maxPages?: number,
  forceFullSync = false,
  pageOffset?: number,
  modeOverride?: SyncRunMode,
  notes?: Record<string, unknown>,
  startPageToken?: string,
  accountEmail?: string
): Promise<IngestRunResult> {
  const client = await getAuthorizedGmailClient({ accountEmail });
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
  let nextPageToken: string | null = startPageToken ?? null;
  let usedIncrementalSync = false;
  let pageCount = 0;
  let syncRun = await prisma.syncRun.create({
    data: {
      gmailAccountId: account.id,
      mode: modeOverride ?? (forceFullSync ? SyncRunMode.FULL : SyncRunMode.INCREMENTAL),
      status: SyncRunStatus.RUNNING,
      maxPages: maxPages ?? null,
      pageOffset: pageOffset ?? 0,
      latestHistoryId,
      notesJson: buildRunNotes(notes, {
        requestedPageOffset: pageOffset ?? 0,
        startPageToken: startPageToken ?? null
      })
    }
  });

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

      nextPageToken = page.nextPageToken ?? null;

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
      await processPages(
        fetchHistoryInPages(client.gmail, existingAccount.historyId, {
          maxPages,
          pageOffset: startPageToken ? 0 : pageOffset,
          startPageToken
        })
      );
    } else {
      await processPages(
        fetchEmailsInPages(client.gmail, {
          maxPages,
          pageOffset: startPageToken ? 0 : pageOffset,
          startPageToken
        })
      );
    }
  } catch (error) {
    if (!(error instanceof GmailHistoryExpiredError)) {
      logger.error("Ingest failed before fallback", {
        error: error instanceof Error ? error.message : "Unknown ingest error"
      });
      await prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: SyncRunStatus.FAILED,
          latestHistoryId,
          pagesProcessed: pageCount,
          processedCount: processed,
          duplicateCount: duplicates,
          errorMessage: error instanceof Error ? error.message : "Unknown ingest error",
          notesJson: buildRunNotes(notes, {
            requestedPageOffset: pageOffset ?? 0,
            startPageToken: startPageToken ?? null,
            nextPageToken,
            usedIncrementalSync
          }),
          completedAt: new Date()
        }
      });
      throw error;
    }

    usedIncrementalSync = false;
    logger.warn("Gmail history expired, falling back to full mailbox sync", {
      existingHistoryId: existingAccount?.historyId ?? null,
      pageOffset: pageOffset ?? 0,
      startPageToken: startPageToken ?? null
    });
    await processPages(
      fetchEmailsInPages(client.gmail, {
        maxPages,
        pageOffset: startPageToken ? 0 : pageOffset,
        startPageToken
      })
    );
  }

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: {
      historyId: latestHistoryId,
      lastSyncedAt: new Date()
    }
  });

  const modeLabel = usedIncrementalSync ? "incremental history sync" : "full mailbox sync";
  const resolvedMode = modeOverride ?? (usedIncrementalSync ? SyncRunMode.INCREMENTAL : SyncRunMode.FULL);
  syncRun = await prisma.syncRun.update({
    where: { id: syncRun.id },
    data: {
      mode: resolvedMode,
      status: SyncRunStatus.SUCCEEDED,
      latestHistoryId,
      pagesProcessed: pageCount,
      processedCount: processed,
      duplicateCount: duplicates,
      notesJson: buildRunNotes(notes, {
        requestedPageOffset: pageOffset ?? 0,
        startPageToken: startPageToken ?? null,
        nextPageToken,
        usedIncrementalSync
      }),
      completedAt: new Date()
    }
  });
  logger.info("Ingest completed", {
    mode: modeLabel,
    processed,
    duplicates,
    pageCount,
    pageOffset: pageOffset ?? 0,
    nextPageToken
  });
  console.log(
    `Ingest complete via ${modeLabel}. New emails: ${processed}. Duplicates skipped: ${duplicates}. Pages processed: ${pageCount}. Page offset: ${pageOffset ?? 0}. Next token: ${nextPageToken ?? "none"}.`
  );
  return {
    processed,
    duplicates,
    pageCount,
    pageOffset: pageOffset ?? 0,
    latestHistoryId,
    nextPageToken,
    usedIncrementalSync,
    mode: resolvedMode,
    syncRunId: syncRun.id
  };
}

function buildRunNotes(
  notes: Record<string, unknown> | undefined,
  extras: Record<string, unknown>
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({
    ...(notes ?? {}),
    ...extras
  })) as Prisma.InputJsonValue;
}

async function runWorkerLoop(maxPages?: number, forceFullSync = false, pageOffset?: number, accountEmail?: string) {
  while (true) {
    try {
      await runIngestOnce(maxPages, forceFullSync, pageOffset, undefined, undefined, undefined, accountEmail);
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
  const pageOffsetFlag = process.argv.find((arg) => arg.startsWith("--page-offset="));
  const pageOffset = pageOffsetFlag ? Number(pageOffsetFlag.split("=")[1]) : undefined;
  const pageTokenFlag = process.argv.find((arg) => arg.startsWith("--page-token="));
  const startPageToken = pageTokenFlag ? pageTokenFlag.split("=")[1] : undefined;
  const accountFlag = process.argv.find((arg) => arg.startsWith("--account="));
  const accountEmail = accountFlag ? accountFlag.split("=")[1] : undefined;
  const loop = process.argv.includes("--loop");
  const forceFullSync = process.argv.includes("--full-sync");

  const runner = loop
    ? runWorkerLoop(maxPages, forceFullSync, pageOffset, accountEmail)
    : runIngestOnce(maxPages, forceFullSync, pageOffset, undefined, undefined, startPageToken, accountEmail);
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
