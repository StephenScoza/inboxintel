import { SyncRunMode } from "@prisma/client";
import { prisma } from "../db";
import { runIngestOnce } from "./ingestGmail";
import { logger } from "../utils/logger";

interface BackfillOptions {
  startOffset: number;
  batchPages: number;
  batches?: number;
  pauseMs: number;
  startToken?: string;
}

function parseNumberFlag(name: string, fallback: number): number {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!flag) {
    return fallback;
  }

  const parsed = Number(flag.split("=")[1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function runBackfill(options: BackfillOptions) {
  const maxBatches = typeof options.batches === "number" && Number.isFinite(options.batches)
    ? Math.max(1, Math.floor(options.batches))
    : undefined;

  let currentOffset = Math.max(0, Math.floor(options.startOffset));
  let continuationToken = options.startToken;
  let completedBatches = 0;
  let totalProcessed = 0;
  let totalDuplicates = 0;
  let totalPages = 0;

  while (!maxBatches || completedBatches < maxBatches) {
    const batchNumber = completedBatches + 1;
    logger.info("Starting Gmail backfill batch", {
      batchNumber,
      pageOffset: currentOffset,
      batchPages: options.batchPages,
      continuationToken: continuationToken ?? null
    });

    const result = await runIngestOnce(
      options.batchPages,
      true,
      currentOffset,
      SyncRunMode.BACKFILL,
      {
        batchNumber,
        backfill: true,
        chainedByPageToken: Boolean(continuationToken)
      },
      continuationToken
    );

    totalProcessed += result.processed;
    totalDuplicates += result.duplicates;
    totalPages += result.pageCount;
    completedBatches += 1;
    continuationToken = result.nextPageToken ?? undefined;

    console.log(
      `Backfill batch ${batchNumber} complete. Offset ${currentOffset}. New emails: ${result.processed}. Duplicates: ${result.duplicates}. Pages: ${result.pageCount}. Next token: ${continuationToken ?? "none"}.`
    );

    if (result.pageCount === 0 || !continuationToken) {
      logger.info("Stopping Gmail backfill because no pages were returned", {
        batchNumber,
        pageOffset: currentOffset,
        continuationToken: continuationToken ?? null
      });
      break;
    }

    currentOffset += options.batchPages;

    if (options.pauseMs > 0 && (!maxBatches || completedBatches < maxBatches)) {
      await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
    }
  }

  console.log(
    `Backfill complete. Batches: ${completedBatches}. Total new emails: ${totalProcessed}. Total duplicates: ${totalDuplicates}. Total pages: ${totalPages}. Final page offset: ${currentOffset}.`
  );
}

if (require.main === module) {
  const startOffset = parseNumberFlag("start-offset", 0);
  const batchPages = Math.max(1, parseNumberFlag("batch-pages", 20));
  const batches = process.argv.some((arg) => arg.startsWith("--batches="))
    ? Math.max(1, parseNumberFlag("batches", 1))
    : undefined;
  const pauseMs = Math.max(0, parseNumberFlag("pause-ms", 0));
  const startTokenFlag = process.argv.find((arg) => arg.startsWith("--start-token="));
  const startToken = startTokenFlag ? startTokenFlag.split("=")[1] : undefined;

  runBackfill({
    startOffset,
    batchPages,
    batches,
    pauseMs,
    startToken
  })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
