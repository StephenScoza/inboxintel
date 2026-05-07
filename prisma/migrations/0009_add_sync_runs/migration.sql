CREATE TYPE "SyncRunMode" AS ENUM ('INCREMENTAL', 'FULL', 'BACKFILL', 'RECOVERY');

CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "SyncRun" (
  "id" TEXT NOT NULL,
  "gmailAccountId" TEXT,
  "mode" "SyncRunMode" NOT NULL,
  "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
  "maxPages" INTEGER,
  "pageOffset" INTEGER,
  "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "latestHistoryId" TEXT,
  "errorMessage" TEXT,
  "notesJson" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SyncRun"
ADD CONSTRAINT "SyncRun_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
