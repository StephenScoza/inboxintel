import { SyncRunMode } from "@prisma/client";
import { prisma } from "../db";
import { runIngestOnce } from "./ingestGmail";
import { logger } from "../utils/logger";
import { config } from "../config";

interface BackfillOptions {
  startOffset: number;
  batchPages: number;
  batches?: number;
  pauseMs: number;
  startToken?: string;
  offsetPaddingPages: number;
  accountEmail?: string;
}

function parseNumberFlag(name: string, fallback: number): number {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!flag) {
    return fallback;
  }

  const parsed = Number(flag.split("=")[1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalOffsetFlag(name: string): number | "auto" {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!flag) {
    return "auto";
  }

  const rawValue = flag.split("=")[1];
  if (rawValue === "auto") {
    return "auto";
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : "auto";
}

async function resolveStartOffset(
  requestedStartOffset: number,
  offsetPaddingPages: number,
  startToken?: string
): Promise<number> {
  if (startToken) {
    return Math.max(0, Math.floor(requestedStartOffset));
  }

  const storedEmailCount = await prisma.email.count();
  const estimatedCoveredPages = Math.ceil(storedEmailCount / config.gmailPageSize);
  const resolvedOffset = Math.max(
    0,
    Math.max(requestedStartOffset, estimatedCoveredPages + Math.max(0, Math.floor(offsetPaddingPages)))
  );

  logger.info("Resolved Gmail backfill start offset", {
    requestedStartOffset,
    offsetPaddingPages,
    storedEmailCount,
    gmailPageSize: config.gmailPageSize,
    estimatedCoveredPages,
    resolvedOffset
  });

  return resolvedOffset;
}

export async function runBackfill(options: BackfillOptions) {
  const maxBatches = typeof options.batches === "number" && Number.isFinite(options.batches)
    ? Math.max(1, Math.floor(options.batches))
    : undefined;

  let currentOffset = await resolveStartOffset(
    options.startOffset,
    options.offsetPaddingPages,
    options.startToken
  );
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
        offsetPaddingPages: options.offsetPaddingPages,
        chainedByPageToken: Boolean(continuationToken)
      },
      continuationToken,
      options.accountEmail
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
  const rawStartOffset = parseOptionalOffsetFlag("start-offset");
  const startOffset = rawStartOffset === "auto" ? 0 : rawStartOffset;
  const batchPages = Math.max(1, parseNumberFlag("batch-pages", 20));
  const batches = process.argv.some((arg) => arg.startsWith("--batches="))
    ? Math.max(1, parseNumberFlag("batches", 1))
    : undefined;
  const pauseMs = Math.max(0, parseNumberFlag("pause-ms", 0));
  const offsetPaddingPages = Math.max(0, parseNumberFlag("offset-padding-pages", 20));
  const startTokenFlag = process.argv.find((arg) => arg.startsWith("--start-token="));
  const startToken = startTokenFlag ? startTokenFlag.split("=")[1] : undefined;
  const accountFlag = process.argv.find((arg) => arg.startsWith("--account="));
  const accountEmail = accountFlag ? accountFlag.split("=")[1] : undefined;

  runBackfill({
    startOffset,
    batchPages,
    batches,
    pauseMs,
    startToken,
    offsetPaddingPages,
    accountEmail
  })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
