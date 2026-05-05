CREATE TYPE "Category" AS ENUM (
  'PERSONAL',
  'RETAIL_PROMO',
  'SUBSCRIPTION',
  'FREE_TRIAL',
  'RENEWAL_NOTICE',
  'PAYMENT_RECEIPT',
  'PRICE_INCREASE',
  'FAILED_PAYMENT',
  'ORDER_OR_SHIPPING',
  'ACCOUNT_SECURITY',
  'RAFFLE_OR_GIVEAWAY',
  'UNKNOWN'
);

CREATE TYPE "AlertType" AS ENUM (
  'FREE_TRIAL_ENDING',
  'RENEWAL_SOON',
  'PRICE_INCREASE',
  'FAILED_PAYMENT',
  'HIGH_OPPORTUNITY',
  'RAFFLE_OR_GIVEAWAY',
  'URGENT_DEADLINE'
);

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'ACTIVE',
  'ENDING_SOON',
  'PAST_DUE',
  'UNKNOWN'
);

CREATE TABLE "GmailAccount" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenPath" TEXT NOT NULL,
  "historyId" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Email" (
  "id" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "gmailThreadId" TEXT,
  "gmailInternalAt" TIMESTAMP(3),
  "gmailLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "senderRaw" TEXT,
  "senderName" TEXT,
  "senderEmail" TEXT,
  "senderDomain" TEXT,
  "subject" TEXT,
  "snippet" TEXT,
  "receivedAt" TIMESTAMP(3),
  "plainTextBody" TEXT,
  "htmlBody" TEXT,
  "rawPayload" JSONB,
  "amountsJson" JSONB,
  "datesJson" JSONB,
  "gmailAccountId" TEXT NOT NULL,
  "senderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailLink" (
  "id" TEXT NOT NULL,
  "emailId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "domain" TEXT,
  "text" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sender" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "domain" TEXT NOT NULL,
  "emailCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sender_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Classification" (
  "id" TEXT NOT NULL,
  "emailId" TEXT NOT NULL,
  "category" "Category" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "urgencyScore" INTEGER NOT NULL,
  "opportunityScore" INTEGER NOT NULL,
  "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "signalsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "gmailAccountId" TEXT NOT NULL,
  "senderId" TEXT,
  "vendor" TEXT NOT NULL,
  "normalizedVendor" TEXT NOT NULL,
  "amount" DECIMAL(10,2),
  "currency" TEXT DEFAULT 'USD',
  "nextRenewalAt" TIMESTAMP(3),
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'UNKNOWN',
  "confidence" INTEGER NOT NULL,
  "sourceCategory" "Category",
  "lastSeenAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Alert" (
  "id" TEXT NOT NULL,
  "emailId" TEXT NOT NULL,
  "gmailAccountId" TEXT NOT NULL,
  "type" "AlertType" NOT NULL,
  "category" "Category" NOT NULL,
  "reason" TEXT NOT NULL,
  "urgencyScore" INTEGER NOT NULL,
  "opportunityScore" INTEGER NOT NULL,
  "webhookTarget" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailAccount_email_key" ON "GmailAccount"("email");
CREATE UNIQUE INDEX "Email_gmailMessageId_key" ON "Email"("gmailMessageId");
CREATE UNIQUE INDEX "EmailLink_emailId_url_key" ON "EmailLink"("emailId", "url");
CREATE UNIQUE INDEX "Sender_email_key" ON "Sender"("email");
CREATE UNIQUE INDEX "Classification_emailId_key" ON "Classification"("emailId");
CREATE UNIQUE INDEX "Subscription_gmailAccountId_normalizedVendor_key" ON "Subscription"("gmailAccountId", "normalizedVendor");

ALTER TABLE "Email"
ADD CONSTRAINT "Email_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Email"
ADD CONSTRAINT "Email_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailLink"
ADD CONSTRAINT "EmailLink_emailId_fkey"
FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Classification"
ADD CONSTRAINT "Classification_emailId_fkey"
FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Alert"
ADD CONSTRAINT "Alert_emailId_fkey"
FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Alert"
ADD CONSTRAINT "Alert_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

