CREATE TYPE "ParseIssueType" AS ENUM (
  'EMAIL_STORAGE_FALLBACK',
  'CLASSIFICATION_STORAGE_FALLBACK',
  'EXTRACTED_PAYLOAD_FALLBACK',
  'LINK_SKIPPED',
  'PROCESSING_FAILED'
);

CREATE TYPE "ParseIssueStage" AS ENUM ('INGEST', 'REPROCESS');

CREATE TYPE "ParseIssueSeverity" AS ENUM ('INFO', 'WARN', 'ERROR');

CREATE TABLE "ParseIssue" (
  "id" TEXT NOT NULL,
  "emailId" TEXT,
  "gmailAccountId" TEXT,
  "gmailMessageId" TEXT NOT NULL,
  "issueType" "ParseIssueType" NOT NULL,
  "stage" "ParseIssueStage" NOT NULL,
  "severity" "ParseIssueSeverity" NOT NULL,
  "summary" TEXT NOT NULL,
  "detailsJson" JSONB,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "ParseIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParseIssue_gmailMessageId_issueType_stage_key"
ON "ParseIssue"("gmailMessageId", "issueType", "stage");

ALTER TABLE "ParseIssue"
ADD CONSTRAINT "ParseIssue_emailId_fkey"
FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ParseIssue"
ADD CONSTRAINT "ParseIssue_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
