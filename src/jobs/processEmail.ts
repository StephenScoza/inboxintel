import { AlertType, Category, ParseIssueSeverity, ParseIssueStage, ParseIssueType, Prisma } from "@prisma/client";
import { gmail_v1 } from "googleapis";
import { sendDiscordAlert } from "../alerts/discord";
import { shouldSuppressAlert } from "../alerts/policy";
import { prisma } from "../db";
import { buildEmailIntelligence } from "../intelligence/buildEmailIntelligence";
import { buildPersistedAmounts, buildPersistedClassificationSignals, buildPersistedDates } from "../intelligence/persistedSnapshot";
import {
  chooseImportantDate,
  chooseSubscriptionAmount,
  determineSubscriptionStatus,
  shouldTrackSubscription
} from "../intelligence/subscriptionFacts";
import { cleanSenderName, deriveVendorIdentity } from "../intelligence/vendorIdentity";
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

function shouldPromoteHighOpportunity(category: Category, opportunityScore: number): AlertType[] {
  const opportunityCategories: Category[] = [
    Category.PRICE_INCREASE,
    Category.RAFFLE_OR_GIVEAWAY,
    Category.FREE_TRIAL
  ];

  if (opportunityCategories.includes(category) && opportunityScore >= 75) {
    return [AlertType.HIGH_OPPORTUNITY];
  }

  return [];
}

interface ProcessContext {
  gmailAccountId: string;
  gmailAccountEmail: string;
}

function isPrismaInvalidArgError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "InvalidArg"
  );
}

export async function processEmail(message: gmail_v1.Schema$Message, context: ProcessContext) {
  if (!message.id) {
    logger.warn("Skipping Gmail message without id");
    return { skipped: true, reason: "missing-message-id" };
  }

  const existing = await prisma.email.findUnique({
    where: { gmailMessageId: message.id }
  });

  const payload = message.payload;
  const headers = payload?.headers ?? [];
  const technicalMetadata = extractHeaders(message);
  if (existing) {
    const shouldRefreshTechnicalMetadata =
      !existing.headersJson ||
      !existing.technicalFactsJson ||
      !existing.messageIdHeader ||
      !existing.payloadMimeType;

    if (shouldRefreshTechnicalMetadata) {
      await prisma.email.update({
        where: { id: existing.id },
        data: {
          gmailHistoryId: technicalMetadata.gmailHistoryId,
          gmailSizeEstimate: technicalMetadata.gmailSizeEstimate,
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
          headersJson: technicalMetadata.headersJson as unknown as Prisma.InputJsonValue,
          technicalFactsJson: technicalMetadata.technicalFactsJson as unknown as Prisma.InputJsonValue
        }
      });

      logger.info("Refreshed technical metadata for existing Gmail message", {
        gmailMessageId: message.id,
        emailId: existing.id
      });
    } else {
      logger.info("Skipping duplicate Gmail message", {
        gmailMessageId: message.id,
        emailId: existing.id
      });
    }

    return { skipped: true, reason: "duplicate" };
  }
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
          domain: senderMeta.senderDomain ?? "unknown",
          emailCount: { increment: 1 }
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
    gmailMessageId: message.id,
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
    rawPayload: undefined,
    headersJson: technicalMetadata.headersJson as unknown as Prisma.InputJsonValue,
    technicalFactsJson: technicalMetadata.technicalFactsJson as unknown as Prisma.InputJsonValue,
    amountsJson: sanitizeJsonValue(buildPersistedAmounts(intelligence)) as unknown as Prisma.InputJsonValue,
    datesJson: sanitizeJsonValue(buildPersistedDates(intelligence)) as unknown as Prisma.InputJsonValue,
    gmailAccountId: context.gmailAccountId,
    senderId: sender?.id ?? null
  };

  const classificationData = {
    category: intelligence.classification.category,
    confidence: intelligence.classification.confidence,
    urgencyScore: intelligence.classification.urgencyScore,
    opportunityScore: intelligence.classification.opportunityScore,
    reasons: intelligence.classification.reasons,
    signalsJson: sanitizeJsonValue(buildPersistedClassificationSignals(intelligence)) as unknown as Prisma.InputJsonValue
  };

  const minimalEmailData = {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId ?? null,
    gmailInternalAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
    gmailHistoryId: technicalMetadata.gmailHistoryId,
    gmailSizeEstimate: technicalMetadata.gmailSizeEstimate,
    gmailLabels: message.labelIds ?? [],
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
    receivedAt,
    headersJson: technicalMetadata.headersJson as unknown as Prisma.InputJsonValue,
    technicalFactsJson: technicalMetadata.technicalFactsJson as unknown as Prisma.InputJsonValue,
    gmailAccountId: context.gmailAccountId,
    senderId: sender?.id ?? null
  };

  const skeletalEmailData = {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId ?? null,
    gmailInternalAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
    gmailHistoryId: technicalMetadata.gmailHistoryId,
    gmailSizeEstimate: technicalMetadata.gmailSizeEstimate,
    gmailLabels: message.labelIds ?? [],
    receivedAt,
    payloadMimeType: technicalMetadata.payloadMimeType,
    payloadPartCount: technicalMetadata.payloadPartCount,
    gmailAccountId: context.gmailAccountId,
    senderId: sender?.id ?? null
  };

  let email;
  let usedEmailFallback = false;
  try {
    email = await prisma.email.create({
      data: {
        ...richEmailData,
        plainTextBody,
        htmlBody
      },
      include: {
        classification: true
      }
    });
    await resolveParseIssuesForMessage({
      gmailMessageId: message.id,
      stage: ParseIssueStage.INGEST,
      issueTypes: [ParseIssueType.EMAIL_STORAGE_FALLBACK]
    });
  } catch (error) {
    if (!isPrismaInvalidArgError(error)) {
      logger.error("Email create failed before fallback", {
        gmailMessageId: message.id,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      await recordParseIssue({
        gmailAccountId: context.gmailAccountId,
        gmailMessageId: message.id,
        issueType: ParseIssueType.PROCESSING_FAILED,
        stage: ParseIssueStage.INGEST,
        severity: ParseIssueSeverity.ERROR,
        summary: "Email storage failed before fallback",
        details: {
          sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
          subject,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
      throw error;
    }

    usedEmailFallback = true;
    logger.warn("Falling back to minimal email storage for Gmail message", {
      gmailMessageId: message.id,
      sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
      subject
    });
    try {
      email = await prisma.email.create({
        data: minimalEmailData,
        include: {
          classification: true
        }
      });
    } catch (fallbackError) {
      if (!isPrismaInvalidArgError(fallbackError)) {
        logger.error("Minimal fallback email create failed", {
          gmailMessageId: message.id,
          error: fallbackError instanceof Error ? fallbackError.message : "Unknown error"
        });
        await recordParseIssue({
          gmailAccountId: context.gmailAccountId,
          gmailMessageId: message.id,
          issueType: ParseIssueType.PROCESSING_FAILED,
          stage: ParseIssueStage.INGEST,
          severity: ParseIssueSeverity.ERROR,
          summary: "Minimal email fallback failed",
          details: {
            sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
            subject,
            error: fallbackError instanceof Error ? fallbackError.message : "Unknown error"
          }
        });
        throw fallbackError;
      }

      logger.warn("Escalating to skeletal email storage for Gmail message", {
        gmailMessageId: message.id,
        sender: senderMeta.senderEmail ?? senderMeta.senderRaw
      });
      email = await prisma.email.create({
        data: skeletalEmailData,
        include: {
          classification: true
        }
      });
    }
  }

  if (usedEmailFallback) {
    await recordParseIssue({
      emailId: email.id,
      gmailAccountId: context.gmailAccountId,
      gmailMessageId: message.id,
      issueType: ParseIssueType.EMAIL_STORAGE_FALLBACK,
      stage: ParseIssueStage.INGEST,
      severity: ParseIssueSeverity.WARN,
      summary: "Email required fallback storage during ingest",
      details: {
        sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
        subject,
        hasPlainTextBody: Boolean(plainTextBody),
        hasHtmlBody: Boolean(htmlBody)
      }
    });
  }

  let usedClassificationFallback = false;
  try {
    await prisma.classification.create({
      data: {
        emailId: email.id,
        ...classificationData
      }
    });
    await Promise.all([
      resolveParseIssuesForMessage({
        gmailMessageId: message.id,
        stage: ParseIssueStage.INGEST,
        issueTypes: [ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK]
      }),
      resolveParseIssuesForMessage({
        gmailMessageId: message.id,
        stage: ParseIssueStage.REPROCESS,
        issueTypes: [ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK]
      })
    ]);
  } catch (error) {
    if (!isPrismaInvalidArgError(error)) {
      logger.error("Classification create failed", {
        gmailMessageId: message.id,
        emailId: email.id,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      await recordParseIssue({
        emailId: email.id,
        gmailAccountId: context.gmailAccountId,
        gmailMessageId: message.id,
        issueType: ParseIssueType.PROCESSING_FAILED,
        stage: ParseIssueStage.INGEST,
        severity: ParseIssueSeverity.ERROR,
        summary: "Classification storage failed",
        details: {
          emailId: email.id,
          subject,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
      throw error;
    }

    usedClassificationFallback = true;
    logger.warn("Falling back to minimal classification storage for Gmail message", {
      gmailMessageId: message.id,
      emailId: email.id
    });
    await prisma.classification.create({
      data: {
        emailId: email.id,
        category: intelligence.classification.category,
        confidence: intelligence.classification.confidence,
        urgencyScore: intelligence.classification.urgencyScore,
        opportunityScore: intelligence.classification.opportunityScore,
        reasons: intelligence.classification.reasons,
        signalsJson: Prisma.JsonNull
      }
    });
    email.classification = null;
  }

  if (usedClassificationFallback) {
    await recordParseIssue({
      emailId: email.id,
      gmailAccountId: context.gmailAccountId,
      gmailMessageId: message.id,
      issueType: ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK,
      stage: ParseIssueStage.INGEST,
      severity: ParseIssueSeverity.WARN,
      summary: "Classification required fallback storage during ingest",
      details: {
        emailId: email.id,
        category: intelligence.classification.category,
        confidence: intelligence.classification.confidence
      }
    });
  }

  let skippedLinkCount = 0;
  for (const link of persistedLinks) {
    try {
      await prisma.emailLink.create({
        data: {
          emailId: email.id,
          url: link.url,
          urlHash: link.urlHash,
          domain: link.domain,
          text: link.text
        }
      });
    } catch (error) {
      if (!isPrismaInvalidArgError(error)) {
        logger.error("Email link create failed", {
          gmailMessageId: message.id,
          emailId: email.id,
          url: link.url,
          error: error instanceof Error ? error.message : "Unknown error"
        });
        throw error;
      }

      logger.warn("Skipping malformed email link", {
        gmailMessageId: message.id,
        emailId: email.id,
        url: link.url
      });
      skippedLinkCount += 1;
    }
  }

  if (skippedLinkCount > 0) {
    await recordParseIssue({
      emailId: email.id,
      gmailAccountId: context.gmailAccountId,
      gmailMessageId: message.id,
      issueType: ParseIssueType.LINK_SKIPPED,
      stage: ParseIssueStage.INGEST,
      severity: ParseIssueSeverity.WARN,
      summary: "One or more links could not be persisted",
      details: {
        emailId: email.id,
        skippedLinkCount
      }
    });
  } else {
    await Promise.all([
      resolveParseIssuesForMessage({
        gmailMessageId: message.id,
        stage: ParseIssueStage.INGEST,
        issueTypes: [ParseIssueType.LINK_SKIPPED]
      }),
      resolveParseIssuesForMessage({
        gmailMessageId: message.id,
        stage: ParseIssueStage.REPROCESS,
        issueTypes: [ParseIssueType.LINK_SKIPPED]
      })
    ]);
  }

  logger.info("Stored Gmail message", {
    gmailMessageId: message.id,
    emailId: email.id,
    category: intelligence.classification.category,
    subject
  });
  await resolveParseIssuesForMessage({
    gmailMessageId: message.id,
    stage: ParseIssueStage.INGEST,
    issueTypes: [ParseIssueType.PROCESSING_FAILED]
  });

  if (shouldTrackSubscription(intelligence.classification.category, intelligence.signals)) {
    const vendor = deriveVendorIdentity(senderMeta.senderName, senderMeta.senderEmail, senderMeta.senderDomain);
    const primaryAmount = chooseSubscriptionAmount(intelligence.amounts);
    const primaryDate = chooseImportantDate(intelligence.dates, intelligence.classification.category);
    const primaryDateIso = primaryDate?.iso ?? null;
    const status = determineSubscriptionStatus(intelligence.classification.category, primaryDateIso);
    const notes = [
      ...intelligence.classification.reasons,
      primaryAmount ? `amount-kind=${primaryAmount.kind}` : null,
      primaryDate ? `date-kind=${primaryDate.kind}` : null
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | ");

    await prisma.subscription.upsert({
      where: {
        gmailAccountId_normalizedVendor: {
          gmailAccountId: context.gmailAccountId,
          normalizedVendor: vendor.normalizedVendor
        }
      },
      update: {
        vendor: vendor.vendor,
        senderId: sender?.id ?? null,
        amount: primaryAmount ? new Prisma.Decimal(primaryAmount.value) : undefined,
        currency: primaryAmount?.currency ?? undefined,
        nextRenewalAt: primaryDateIso ? new Date(primaryDateIso) : undefined,
        status,
        confidence: intelligence.classification.confidence,
        sourceCategory: intelligence.classification.category,
        lastSeenAt: receivedAt ?? new Date(),
        notes
      },
        create: {
          gmailAccountId: context.gmailAccountId,
          senderId: sender?.id ?? null,
          vendor: vendor.vendor,
          normalizedVendor: vendor.normalizedVendor,
          amount: primaryAmount ? new Prisma.Decimal(primaryAmount.value) : undefined,
        currency: primaryAmount?.currency ?? "USD",
        nextRenewalAt: primaryDateIso ? new Date(primaryDateIso) : null,
        status,
        confidence: intelligence.classification.confidence,
        sourceCategory: intelligence.classification.category,
        lastSeenAt: receivedAt ?? new Date(),
        notes
      }
    });
  }

  const alertTypes = Array.from(new Set([
    ...intelligence.classification.alertTypes,
    ...shouldPromoteHighOpportunity(intelligence.classification.category, intelligence.classification.opportunityScore)
  ]));
  const primaryAmount = chooseSubscriptionAmount(intelligence.amounts) ?? intelligence.amounts[0] ?? null;
  const primaryDate =
    chooseImportantDate(intelligence.dates, intelligence.classification.category) ?? intelligence.dates[0] ?? null;
  const primaryAmountLabel = primaryAmount ? `${primaryAmount.currency} ${primaryAmount.value.toFixed(2)}` : null;
  const primaryDateIso = primaryDate?.iso ?? null;

  for (const alertType of alertTypes) {
    const alertReason = intelligence.classification.reasons[0] ?? "Alert-worthy email";
    const suppression = await shouldSuppressAlert({
      emailId: email.id,
      gmailAccountId: context.gmailAccountId,
      alertType,
      category: intelligence.classification.category,
      sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
      reason: alertReason,
      urgencyScore: intelligence.classification.urgencyScore,
      opportunityScore: intelligence.classification.opportunityScore
    });

    if (suppression.suppressed) {
      await prisma.alert.create({
        data: {
          emailId: email.id,
          gmailAccountId: context.gmailAccountId,
          type: alertType,
          category: intelligence.classification.category,
          reason: `${alertReason} (suppressed duplicate)`,
          urgencyScore: intelligence.classification.urgencyScore,
          opportunityScore: intelligence.classification.opportunityScore,
          webhookTarget: "suppressed",
          payloadJson: sanitizeJsonValue({
            suppressed: true,
            senderKey: senderMeta.senderEmail ?? senderMeta.senderRaw,
            suppressionKey: suppression.suppressionKey,
            existingAlertId: suppression.existingAlertId
          }) as unknown as Prisma.InputJsonValue
        }
      });
      continue;
    }

    try {
      const delivery = await sendDiscordAlert({
        alertType,
        category: intelligence.classification.category,
        subject,
        sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
        reason: alertReason,
        urgencyScore: intelligence.classification.urgencyScore,
        opportunityScore: intelligence.classification.opportunityScore,
        confidence: intelligence.classification.confidence,
        detectedAmount: primaryAmountLabel,
        detectedDate: primaryDateIso,
        gmailAccountEmail: context.gmailAccountEmail,
        emailId: email.id
      });

      await prisma.alert.create({
        data: {
          emailId: email.id,
          gmailAccountId: context.gmailAccountId,
          type: alertType,
          category: intelligence.classification.category,
          reason: alertReason,
          urgencyScore: intelligence.classification.urgencyScore,
          opportunityScore: intelligence.classification.opportunityScore,
          webhookTarget: delivery.webhookTarget,
          deliveredAt: delivery.deliveredAt,
          payloadJson: sanitizeJsonValue({
            ...((delivery.payloadJson as unknown) as Record<string, unknown>),
            senderKey: senderMeta.senderEmail ?? senderMeta.senderRaw,
            suppressionKey: suppression.suppressionKey
          }) as unknown as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      await prisma.alert.create({
        data: {
          emailId: email.id,
          gmailAccountId: context.gmailAccountId,
          type: alertType,
          category: intelligence.classification.category,
          reason: `${alertReason} (delivery failed)`,
          urgencyScore: intelligence.classification.urgencyScore,
          opportunityScore: intelligence.classification.opportunityScore,
          webhookTarget: "delivery-failed",
          payloadJson: sanitizeJsonValue({
            error: error instanceof Error ? error.message : "Unknown delivery error",
            senderKey: senderMeta.senderEmail ?? senderMeta.senderRaw,
            suppressionKey: suppression.suppressionKey
          }) as unknown as Prisma.InputJsonValue
        }
      });
    }
  }

  return { skipped: false, emailId: email.id };
}
