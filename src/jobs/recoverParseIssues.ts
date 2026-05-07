import { ParseIssueSeverity, ParseIssueStage, ParseIssueType, Prisma } from "@prisma/client";
import { gmail_v1 } from "googleapis";
import { prisma } from "../db";
import { getAuthorizedGmailClient } from "../gmail/client";
import { fetchMessageById } from "../gmail/fetchEmails";
import { buildEmailIntelligence } from "../intelligence/buildEmailIntelligence";
import {
  buildPersistedAmounts,
  buildPersistedClassificationSignals,
  buildPersistedDates
} from "../intelligence/persistedSnapshot";
import { deriveVendorIdentity, cleanSenderName } from "../intelligence/vendorIdentity";
import { extractBody } from "../parser/extractBody";
import { extractHeaders } from "../parser/extractHeaders";
import { extractLinks } from "../parser/extractLinks";
import { buildPersistedEmailLinks } from "../parser/persistLinks";
import { logger } from "../utils/logger";
import { recordParseIssue, resolveParseIssuesForMessage } from "../utils/parseIssues";
import { sanitizeJsonValue, sanitizeText } from "../utils/safeJson";

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
  const header = headers?.find((entry) => entry.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function parseSender(raw: string | null) {
  if (!raw) {
    return {
      senderRaw: null,
      senderName: null,
      senderEmail: null,
      senderDomain: null
    };
  }

  const match = raw.match(/^(?:"?([^"]*)"?\s)?<?([^<>]+@[^<>]+)>?$/);
  const senderEmail = (match?.[2] ?? raw).trim().toLowerCase();
  const senderName = cleanSenderName(match?.[1]?.trim() || null);
  const senderDomain = senderEmail.includes("@") ? senderEmail.split("@")[1] : null;

  return {
    senderRaw: raw,
    senderName,
    senderEmail,
    senderDomain
  };
}

function isPrismaInvalidArgError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "InvalidArg"
  );
}

async function recoverStoredEmailFromMessage(
  existingEmailId: string,
  message: gmail_v1.Schema$Message
) {
  const existing = await prisma.email.findUnique({
    where: { id: existingEmailId },
    include: {
      links: true
    }
  });

  if (!existing || !message.id) {
    return { recovered: false, reason: "missing-email-record" as const };
  }

  const payload = message.payload;
  const headers = payload?.headers ?? [];
  const technicalMetadata = extractHeaders(message);
  const subject = sanitizeText(getHeader(headers, "Subject")) ?? null;
  const rawSender = getHeader(headers, "From");
  const receivedHeader = getHeader(headers, "Date");
  const senderMeta = parseSender(rawSender);
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate))
    : receivedHeader
      ? new Date(receivedHeader)
      : null;
  const extractedBody = extractBody(payload);
  const plainTextBody = sanitizeText(extractedBody.plainTextBody) ?? null;
  const htmlBody = sanitizeText(extractedBody.htmlBody) ?? null;
  const links = extractLinks(plainTextBody, htmlBody).map((link) => ({
    url: sanitizeText(link.url) ?? link.url,
    domain: sanitizeText(link.domain) ?? null,
    text: sanitizeText(link.text) ?? null
  }));
  const persistedLinks = buildPersistedEmailLinks(links);
  const intelligence = buildEmailIntelligence({
    subject,
    snippet: message.snippet ?? null,
    plainTextBody,
    htmlBody,
    labels: message.labelIds ?? [],
    senderDomain: senderMeta.senderDomain,
    links
  });

  const sender = senderMeta.senderEmail
    ? await prisma.sender.upsert({
        where: { email: senderMeta.senderEmail },
        update: {
          name: senderMeta.senderName ?? undefined,
          domain: senderMeta.senderDomain ?? "unknown"
        },
        create: {
          email: senderMeta.senderEmail,
          name: senderMeta.senderName,
          domain: senderMeta.senderDomain ?? "unknown",
          emailCount: 1
        }
      })
    : null;

  const richEmailData = {
    gmailThreadId: message.threadId ?? null,
    gmailInternalAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
    gmailHistoryId: technicalMetadata.gmailHistoryId,
    gmailSizeEstimate: technicalMetadata.gmailSizeEstimate,
    gmailLabels: message.labelIds ?? [],
    senderRaw: sanitizeText(senderMeta.senderRaw) ?? null,
    senderName: senderMeta.senderName,
    senderEmail: senderMeta.senderEmail,
    senderDomain: senderMeta.senderDomain,
    toHeader: technicalMetadata.toHeader,
    ccHeader: technicalMetadata.ccHeader,
    bccHeader: technicalMetadata.bccHeader,
    replyTo: technicalMetadata.replyTo,
    returnPath: technicalMetadata.returnPath,
    deliveredTo: technicalMetadata.deliveredTo,
    messageIdHeader: technicalMetadata.messageIdHeader,
    inReplyTo: technicalMetadata.inReplyTo,
    referencesHeader: technicalMetadata.referencesHeader,
    listId: technicalMetadata.listId,
    listUnsubscribe: technicalMetadata.listUnsubscribe,
    listUnsubscribePost: technicalMetadata.listUnsubscribePost,
    precedence: technicalMetadata.precedence,
    autoSubmitted: technicalMetadata.autoSubmitted,
    authenticationResults: technicalMetadata.authenticationResults,
    payloadMimeType: technicalMetadata.payloadMimeType,
    payloadPartCount: technicalMetadata.payloadPartCount,
    subject,
    snippet: sanitizeText(message.snippet ?? null) ?? null,
    receivedAt,
    plainTextBody,
    htmlBody,
    headersJson: technicalMetadata.headersJson as unknown as Prisma.InputJsonValue,
    technicalFactsJson: technicalMetadata.technicalFactsJson as unknown as Prisma.InputJsonValue,
    amountsJson: sanitizeJsonValue(buildPersistedAmounts(intelligence)) as unknown as Prisma.InputJsonValue,
    datesJson: sanitizeJsonValue(buildPersistedDates(intelligence)) as unknown as Prisma.InputJsonValue,
    senderId: sender?.id ?? null
  };

  let recoveredRichEmail = false;
  try {
    await prisma.email.update({
      where: { id: existing.id },
      data: richEmailData
    });
    recoveredRichEmail = true;
    await resolveParseIssuesForMessage({
      gmailMessageId: existing.gmailMessageId,
      stage: ParseIssueStage.INGEST,
      issueTypes: [ParseIssueType.EMAIL_STORAGE_FALLBACK]
    });
  } catch (error) {
    if (!isPrismaInvalidArgError(error)) {
      throw error;
    }

    logger.warn("Rich email recovery fell back to metadata-only update", {
      emailId: existing.id,
      gmailMessageId: existing.gmailMessageId
    });

    await prisma.email.update({
      where: { id: existing.id },
      data: {
        ...richEmailData,
        plainTextBody: existing.plainTextBody,
        htmlBody: existing.htmlBody
      }
    });

    await recordParseIssue({
      emailId: existing.id,
      gmailAccountId: existing.gmailAccountId,
      gmailMessageId: existing.gmailMessageId,
      issueType: ParseIssueType.EMAIL_STORAGE_FALLBACK,
      stage: ParseIssueStage.REPROCESS,
      severity: ParseIssueSeverity.WARN,
      summary: "Email still requires fallback storage after recovery attempt",
      details: {
        emailId: existing.id,
        subject,
        recoveredPlainTextBody: Boolean(plainTextBody),
        recoveredHtmlBody: Boolean(htmlBody)
      }
    });
  }

  await prisma.classification.upsert({
    where: {
      emailId: existing.id
    },
    update: {
      category: intelligence.classification.category,
      confidence: intelligence.classification.confidence,
      urgencyScore: intelligence.classification.urgencyScore,
      opportunityScore: intelligence.classification.opportunityScore,
      reasons: intelligence.classification.reasons,
      signalsJson: sanitizeJsonValue(buildPersistedClassificationSignals(intelligence)) as unknown as Prisma.InputJsonValue
    },
    create: {
      emailId: existing.id,
      category: intelligence.classification.category,
      confidence: intelligence.classification.confidence,
      urgencyScore: intelligence.classification.urgencyScore,
      opportunityScore: intelligence.classification.opportunityScore,
      reasons: intelligence.classification.reasons,
      signalsJson: sanitizeJsonValue(buildPersistedClassificationSignals(intelligence)) as unknown as Prisma.InputJsonValue
    }
  });

  await Promise.all([
    resolveParseIssuesForMessage({
      gmailMessageId: existing.gmailMessageId,
      stage: ParseIssueStage.INGEST,
      issueTypes: [ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK, ParseIssueType.LINK_SKIPPED]
    }),
    resolveParseIssuesForMessage({
      gmailMessageId: existing.gmailMessageId,
      stage: ParseIssueStage.REPROCESS,
      issueTypes: [ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK, ParseIssueType.LINK_SKIPPED]
    })
  ]);

  for (const link of persistedLinks) {
    await prisma.emailLink.upsert({
      where: {
        emailId_urlHash: {
          emailId: existing.id,
          urlHash: link.urlHash
        }
      },
      update: {
        url: link.url,
        domain: link.domain,
        text: link.text
      },
      create: {
        emailId: existing.id,
        url: link.url,
        urlHash: link.urlHash,
        domain: link.domain,
        text: link.text
      }
    });
  }

  if (persistedLinks.length > 0) {
    await prisma.emailLink.deleteMany({
      where: {
        emailId: existing.id,
        urlHash: {
          notIn: persistedLinks.map((link) => link.urlHash)
        }
      }
    });
  }

  const vendor = deriveVendorIdentity(senderMeta.senderName, senderMeta.senderEmail, senderMeta.senderDomain);
  await prisma.subscription.updateMany({
    where: {
      gmailAccountId: existing.gmailAccountId,
      senderId: existing.senderId ?? undefined,
      normalizedVendor: vendor.normalizedVendor
    },
    data: {
      senderId: sender?.id ?? null
    }
  });

  return {
    recovered: recoveredRichEmail,
    emailId: existing.id
  };
}

export async function runRecoverParseIssues(limit?: number) {
  const client = await getAuthorizedGmailClient();
  const account = await prisma.gmailAccount.findUnique({
    where: { email: client.emailAddress }
  });

  if (!account) {
    throw new Error(`No GmailAccount found for ${client.emailAddress}. Run ingest first.`);
  }

  const openIssues = await prisma.parseIssue.findMany({
    where: {
      resolvedAt: null,
      gmailAccountId: account.id,
      issueType: ParseIssueType.EMAIL_STORAGE_FALLBACK
    },
    orderBy: {
      lastSeenAt: "desc"
    },
    take: typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : undefined
  });

  let recovered = 0;
  let partial = 0;
  let missing = 0;

  for (const issue of openIssues) {
    try {
      const message = await fetchMessageById(client.gmail, issue.gmailMessageId);
      if (!message?.id) {
        missing += 1;
        await recordParseIssue({
          emailId: issue.emailId,
          gmailAccountId: account.id,
          gmailMessageId: issue.gmailMessageId,
          issueType: ParseIssueType.PROCESSING_FAILED,
          stage: ParseIssueStage.REPROCESS,
          severity: ParseIssueSeverity.WARN,
          summary: "Gmail message was unavailable for fallback recovery",
          details: {
            issueType: issue.issueType
          }
        });
        continue;
      }

      if (!issue.emailId) {
        partial += 1;
        await recordParseIssue({
          gmailAccountId: account.id,
          gmailMessageId: issue.gmailMessageId,
          issueType: ParseIssueType.PROCESSING_FAILED,
          stage: ParseIssueStage.REPROCESS,
          severity: ParseIssueSeverity.WARN,
          summary: "Fallback recovery skipped because the parse issue is not linked to an email record",
          details: {
            issueType: issue.issueType
          }
        });
        continue;
      }

      const result = await recoverStoredEmailFromMessage(issue.emailId, message);

      if (result.recovered) {
        recovered += 1;
      } else {
        partial += 1;
      }
    } catch (error) {
      partial += 1;
      logger.error("Fallback email recovery failed", {
        gmailMessageId: issue.gmailMessageId,
        emailId: issue.emailId,
        error: error instanceof Error ? error.message : "Unknown recovery error"
      });
      await recordParseIssue({
        emailId: issue.emailId,
        gmailAccountId: account.id,
        gmailMessageId: issue.gmailMessageId,
        issueType: ParseIssueType.PROCESSING_FAILED,
        stage: ParseIssueStage.REPROCESS,
        severity: ParseIssueSeverity.ERROR,
        summary: "Fallback email recovery failed",
        details: {
          issueType: issue.issueType,
          error: error instanceof Error ? error.message : "Unknown recovery error"
        }
      });
    }
  }

  console.log(
    `Recovered ${recovered} fallback email(s). Partial recoveries: ${partial}. Missing Gmail messages: ${missing}.`
  );
}

if (require.main === module) {
  const limitFlag = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitFlag ? Number(limitFlag.split("=")[1]) : undefined;

  runRecoverParseIssues(limit)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
