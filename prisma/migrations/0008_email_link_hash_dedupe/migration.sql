ALTER TABLE "EmailLink"
ADD COLUMN "urlHash" TEXT;

UPDATE "EmailLink"
SET "urlHash" = md5("url")
WHERE "urlHash" IS NULL;

ALTER TABLE "EmailLink"
ALTER COLUMN "urlHash" SET NOT NULL;

DROP INDEX IF EXISTS "EmailLink_emailId_url_key";

CREATE UNIQUE INDEX "EmailLink_emailId_urlHash_key"
ON "EmailLink"("emailId", "urlHash");
