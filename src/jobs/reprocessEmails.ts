import { Category, ParseIssueSeverity, ParseIssueStage, ParseIssueType, Prisma } from "@prisma/client";
import { shouldSuppressAlert } from "../alerts/policy";
import { prisma } from "../db";
import {
  chooseImportantDate,
  chooseSubscriptionAmount,
  determineSubscriptionStatus,
  shouldTrackSubscription
} from "../intelligence/subscriptionFacts";
import { buildEmailIntelligence } from "../intelligence/buildEmailIntelligence";
import {
  buildPersistedAmounts,
  buildPersistedClassificationSignals,
  buildPersistedDates
} from "../intelligence/persistedSnapshot";
import { deriveVendorIdentity } from "../intelligence/vendorIdentity";
import { sendDiscordAlert } from "../alerts/discord";
import { extractLinks } from "../parser/extractLinks";
import { buildPersistedEmailLinks } from "../parser/persistLinks";
import { logger } from "../utils/logger";
import { recordParseIssue, resolveParseIssuesForMessage } from "../utils/parseIssues";
import { sanitizeJsonValue } from "../utils/safeJson";

function isPrismaInvalidArgError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "InvalidArg"
  );
}

async function maybeCreateAlertsForReprocessedEmail(params: {
  emailId: string;
  gmailAccountId: string;
  gmailAccountEmail: string;
  subject: string | null;
  sender: string | null;
  classification: ReturnType<typeof buildEmailIntelligence>["classification"];
  primaryAmountLabel: string | null;
  primaryDateIso: string | null;
}) {
  for (const alertType of params.classification.alertTypes) {
    const existing = await prisma.alert.findFirst({
      where: {
        emailId: params.emailId,
        type: alertType
      }
    });

    if (existing) {
      continue;
    }

    const alertReason = params.classification.reasons[0] ?? "Alert-worthy email";
    const suppression = await shouldSuppressAlert({
      emailId: params.emailId,
      gmailAccountId: params.gmailAccountId,
      alertType,
      category: params.classification.category,
      sender: params.sender,
      reason: alertReason,
      urgencyScore: params.classification.urgencyScore,
      opportunityScore: params.classification.opportunityScore
    });

    if (suppression.suppressed) {
      await prisma.alert.create({
        data: {
          emailId: params.emailId,
          gmailAccountId: params.gmailAccountId,
          type: alertType,
          category: params.classification.category,
          reason: `${alertReason} (suppressed duplicate)`,
          urgencyScore: params.classification.urgencyScore,
          opportunityScore: params.classification.opportunityScore,
          webhookTarget: "suppressed",
          payloadJson: sanitizeJsonValue({
            suppressed: true,
            senderKey: params.sender,
            suppressionKey: suppression.suppressionKey,
            existingAlertId: suppression.existingAlertId,
            reprocessed: true
          }) as unknown as Prisma.InputJsonValue
        }
      });
      continue;
    }

    try {
      const delivery = await sendDiscordAlert({
        alertType,
        category: params.classification.category,
        subject: params.subject,
        sender: params.sender,
        reason: alertReason,
        urgencyScore: params.classification.urgencyScore,
        opportunityScore: params.classification.opportunityScore,
        confidence: params.classification.confidence,
        detectedAmount: params.primaryAmountLabel,
        detectedDate: params.primaryDateIso,
        gmailAccountEmail: params.gmailAccountEmail,
        emailId: params.emailId
      });

      await prisma.alert.create({
        data: {
          emailId: params.emailId,
          gmailAccountId: params.gmailAccountId,
          type: alertType,
          category: params.classification.category,
          reason: alertReason,
          urgencyScore: params.classification.urgencyScore,
          opportunityScore: params.classification.opportunityScore,
          webhookTarget: delivery.webhookTarget,
          deliveredAt: delivery.deliveredAt,
          payloadJson: sanitizeJsonValue({
            ...((delivery.payloadJson as unknown) as Record<string, unknown>),
            senderKey: params.sender,
            suppressionKey: suppression.suppressionKey,
            reprocessed: true
          }) as unknown as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      await prisma.alert.create({
        data: {
          emailId: params.emailId,
          gmailAccountId: params.gmailAccountId,
          type: alertType,
          category: params.classification.category,
          reason: `${alertReason} (delivery failed)`,
          urgencyScore: params.classification.urgencyScore,
          opportunityScore: params.classification.opportunityScore,
          webhookTarget: "delivery-failed",
          payloadJson: sanitizeJsonValue({
            error: error instanceof Error ? error.message : "Unknown delivery error",
            reprocessed: true,
            senderKey: params.sender,
            suppressionKey: suppression.suppressionKey
          }) as unknown as Prisma.InputJsonValue
        }
      });
    }
  }
}

interface ReprocessOptions {
  limit?: number;
  accountEmail?: string;
  category?: Category;
  senderDomain?: string;
}

export async function runReprocess(options: ReprocessOptions = {}) {
  const emailRefs = await prisma.email.findMany({
    where: {
      ...(options.accountEmail
        ? {
            gmailAccount: {
              email: options.accountEmail
            }
          }
        : {}),
      ...(options.senderDomain ? { senderDomain: options.senderDomain } : {}),
      ...(options.category
        ? {
            classification: {
              category: options.category
            }
          }
        : {})
    },
    orderBy: {
      receivedAt: "desc"
    },
    take: typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : undefined,
    select: {
      id: true,
      gmailMessageId: true,
      gmailAccountId: true
    }
  });

  let updated = 0;
  let failed = 0;

  for (const emailRef of emailRefs) {
    let email;
    try {
      email = await prisma.email.findUnique({
        where: {
          id: emailRef.id
        },
        include: {
          links: true,
          classification: true,
          gmailAccount: true,
          sender: true
        }
      });
    } catch (error) {
      failed += 1;
      logger.error("Failed to load stored email for reprocess", {
        emailId: emailRef.id,
        gmailMessageId: emailRef.gmailMessageId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      await recordParseIssue({
        emailId: emailRef.id,
        gmailAccountId: emailRef.gmailAccountId,
        gmailMessageId: emailRef.gmailMessageId,
        issueType: ParseIssueType.PROCESSING_FAILED,
        stage: ParseIssueStage.REPROCESS,
        severity: ParseIssueSeverity.ERROR,
        summary: "Stored email could not be loaded for reprocess",
        details: {
          emailId: emailRef.id,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
      continue;
    }

    if (!email) {
      continue;
    }

    const extractedLinks = extractLinks(email.plainTextBody, email.htmlBody);
    const persistedLinks = buildPersistedEmailLinks(extractedLinks);
    const intelligence = buildEmailIntelligence({
      subject: email.subject,
      snippet: email.snippet,
      plainTextBody: email.plainTextBody,
      htmlBody: email.htmlBody,
      labels: email.gmailLabels,
      senderDomain: email.senderDomain,
      links: extractedLinks.length > 0
        ? extractedLinks
        : email.links.map((link) => ({
          url: link.url,
          domain: link.domain,
          text: link.text
        }))
    });

    try {
      let usedClassificationFallback = false;
      try {
        await prisma.classification.upsert({
          where: {
            emailId: email.id
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
            emailId: email.id,
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
            gmailMessageId: email.gmailMessageId,
            stage: ParseIssueStage.REPROCESS,
            issueTypes: [ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK]
          }),
          resolveParseIssuesForMessage({
            gmailMessageId: email.gmailMessageId,
            stage: ParseIssueStage.INGEST,
            issueTypes: [ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK]
          })
        ]);
      } catch (error) {
        if (!isPrismaInvalidArgError(error)) {
          throw error;
        }

        usedClassificationFallback = true;
        logger.warn("Falling back to minimal classification storage during reprocess", {
          emailId: email.id,
          gmailMessageId: email.gmailMessageId
        });
        await prisma.classification.upsert({
          where: {
            emailId: email.id
          },
          update: {
            category: intelligence.classification.category,
            confidence: intelligence.classification.confidence,
            urgencyScore: intelligence.classification.urgencyScore,
            opportunityScore: intelligence.classification.opportunityScore,
            reasons: intelligence.classification.reasons,
            signalsJson: Prisma.JsonNull
          },
          create: {
            emailId: email.id,
            category: intelligence.classification.category,
            confidence: intelligence.classification.confidence,
            urgencyScore: intelligence.classification.urgencyScore,
            opportunityScore: intelligence.classification.opportunityScore,
            reasons: intelligence.classification.reasons,
            signalsJson: Prisma.JsonNull
          }
        });
      }

      if (usedClassificationFallback) {
        await recordParseIssue({
          emailId: email.id,
          gmailAccountId: email.gmailAccountId,
          gmailMessageId: email.gmailMessageId,
          issueType: ParseIssueType.CLASSIFICATION_STORAGE_FALLBACK,
          stage: ParseIssueStage.REPROCESS,
          severity: ParseIssueSeverity.WARN,
          summary: "Classification required fallback storage during reprocess",
          details: {
            emailId: email.id,
            category: intelligence.classification.category,
            confidence: intelligence.classification.confidence
          }
        });
      }

      let usedPayloadFallback = false;
      try {
        await prisma.email.update({
          where: { id: email.id },
          data: {
            amountsJson: sanitizeJsonValue(buildPersistedAmounts(intelligence)) as unknown as Prisma.InputJsonValue,
            datesJson: sanitizeJsonValue(buildPersistedDates(intelligence)) as unknown as Prisma.InputJsonValue
          }
        });
        await resolveParseIssuesForMessage({
          gmailMessageId: email.gmailMessageId,
          stage: ParseIssueStage.REPROCESS,
          issueTypes: [ParseIssueType.EXTRACTED_PAYLOAD_FALLBACK]
        });
      } catch (error) {
        if (!isPrismaInvalidArgError(error)) {
          throw error;
        }

        usedPayloadFallback = true;
        logger.warn("Falling back to minimal extracted payload storage during reprocess", {
          emailId: email.id,
          gmailMessageId: email.gmailMessageId
        });
        await prisma.email.update({
          where: { id: email.id },
          data: {
            amountsJson: Prisma.JsonNull,
            datesJson: Prisma.JsonNull
          }
        });
      }

      if (usedPayloadFallback) {
        await recordParseIssue({
          emailId: email.id,
          gmailAccountId: email.gmailAccountId,
          gmailMessageId: email.gmailMessageId,
          issueType: ParseIssueType.EXTRACTED_PAYLOAD_FALLBACK,
          stage: ParseIssueStage.REPROCESS,
          severity: ParseIssueSeverity.WARN,
          summary: "Amounts or dates required fallback storage during reprocess",
          details: {
            emailId: email.id,
            category: intelligence.classification.category
          }
        });
      }

      let skippedLinkCount = 0;
      for (const link of persistedLinks) {
        try {
          await prisma.emailLink.upsert({
            where: {
              emailId_urlHash: {
                emailId: email.id,
                urlHash: link.urlHash
              }
            },
            update: {
              url: link.url,
              domain: link.domain,
              text: link.text
            },
            create: {
              emailId: email.id,
              url: link.url,
              urlHash: link.urlHash,
              domain: link.domain,
              text: link.text
            }
          });
        } catch (error) {
          if (!isPrismaInvalidArgError(error)) {
            throw error;
          }

          skippedLinkCount += 1;
          logger.warn("Skipping malformed email link during reprocess", {
            emailId: email.id,
            gmailMessageId: email.gmailMessageId,
            url: link.url
          });
        }
      }

      if (skippedLinkCount === 0) {
        if (persistedLinks.length > 0) {
          await prisma.emailLink.deleteMany({
            where: {
              emailId: email.id,
              urlHash: {
                notIn: persistedLinks.map((link) => link.urlHash)
              }
            }
          });
        } else if (email.links.length > 0) {
          await prisma.emailLink.deleteMany({
            where: {
              emailId: email.id
            }
          });
        }

        await Promise.all([
          resolveParseIssuesForMessage({
            gmailMessageId: email.gmailMessageId,
            stage: ParseIssueStage.REPROCESS,
            issueTypes: [ParseIssueType.LINK_SKIPPED]
          }),
          resolveParseIssuesForMessage({
            gmailMessageId: email.gmailMessageId,
            stage: ParseIssueStage.INGEST,
            issueTypes: [ParseIssueType.LINK_SKIPPED]
          })
        ]);
      } else {
        await recordParseIssue({
          emailId: email.id,
          gmailAccountId: email.gmailAccountId,
          gmailMessageId: email.gmailMessageId,
          issueType: ParseIssueType.LINK_SKIPPED,
          stage: ParseIssueStage.REPROCESS,
          severity: ParseIssueSeverity.WARN,
          summary: "One or more links could not be rebuilt during reprocess",
          details: {
            emailId: email.id,
            skippedLinkCount
          }
        });
      }

      if (shouldTrackSubscription(intelligence.classification.category, intelligence.signals)) {
        const vendor = deriveVendorIdentity(email.senderName, email.senderEmail, email.senderDomain);
        const primaryAmount = chooseSubscriptionAmount(intelligence.amounts);
        const primaryDate = chooseImportantDate(intelligence.dates, intelligence.classification.category);
        const primaryDateIso = primaryDate?.iso ?? null;
        const status = determineSubscriptionStatus(intelligence.classification.category, primaryDateIso);
        const notes = [
          ...intelligence.classification.reasons,
          primaryAmount ? `amount-kind=${primaryAmount.kind}` : null,
          primaryDate ? `date-kind=${primaryDate.kind}` : null,
          "reprocessed=true"
        ]
          .filter((value): value is string => Boolean(value))
          .join(" | ");

        await prisma.subscription.upsert({
          where: {
            gmailAccountId_normalizedVendor: {
              gmailAccountId: email.gmailAccountId,
              normalizedVendor: vendor.normalizedVendor
            }
          },
          update: {
            vendor: vendor.vendor,
            senderId: email.senderId,
            amount: primaryAmount ? new Prisma.Decimal(primaryAmount.value) : undefined,
            currency: primaryAmount?.currency ?? undefined,
            nextRenewalAt: primaryDateIso ? new Date(primaryDateIso) : undefined,
            status,
            confidence: intelligence.classification.confidence,
            sourceCategory: intelligence.classification.category,
            lastSeenAt: email.receivedAt ?? new Date(),
            notes
          },
          create: {
            gmailAccountId: email.gmailAccountId,
            senderId: email.senderId,
            vendor: vendor.vendor,
            normalizedVendor: vendor.normalizedVendor,
            amount: primaryAmount ? new Prisma.Decimal(primaryAmount.value) : undefined,
            currency: primaryAmount?.currency ?? "USD",
            nextRenewalAt: primaryDateIso ? new Date(primaryDateIso) : null,
            status,
            confidence: intelligence.classification.confidence,
            sourceCategory: intelligence.classification.category,
            lastSeenAt: email.receivedAt ?? new Date(),
            notes
          }
        });

        const primaryAmountLabel = primaryAmount ? `${primaryAmount.currency} ${primaryAmount.value.toFixed(2)}` : null;
        await maybeCreateAlertsForReprocessedEmail({
          emailId: email.id,
          gmailAccountId: email.gmailAccountId,
          gmailAccountEmail: email.gmailAccount.email,
          subject: email.subject,
          sender: email.senderEmail ?? email.senderRaw,
          classification: intelligence.classification,
          primaryAmountLabel,
          primaryDateIso
        });
      }

      updated += 1;
      await resolveParseIssuesForMessage({
        gmailMessageId: email.gmailMessageId,
        stage: ParseIssueStage.REPROCESS,
        issueTypes: [ParseIssueType.PROCESSING_FAILED]
      });
    } catch (error) {
      failed += 1;
      logger.error("Failed to reprocess stored email", {
        emailId: email.id,
        gmailMessageId: email.gmailMessageId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      await recordParseIssue({
        emailId: email.id,
        gmailAccountId: email.gmailAccountId,
        gmailMessageId: email.gmailMessageId,
        issueType: ParseIssueType.PROCESSING_FAILED,
        stage: ParseIssueStage.REPROCESS,
        severity: ParseIssueSeverity.ERROR,
        summary: "Stored email failed reprocess",
        details: {
          emailId: email.id,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  }

  console.log(`Reprocessed ${updated} stored email(s). Failed ${failed}.`);
}

if (require.main === module) {
  const limitFlag = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitFlag ? Number(limitFlag.split("=")[1]) : undefined;
  const accountFlag = process.argv.find((arg) => arg.startsWith("--account="));
  const accountEmail = accountFlag ? accountFlag.split("=")[1] : undefined;
  const categoryFlag = process.argv.find((arg) => arg.startsWith("--category="));
  const rawCategory = categoryFlag ? categoryFlag.split("=")[1] : undefined;
  const category = rawCategory && rawCategory in Category
    ? Category[rawCategory as keyof typeof Category]
    : undefined;
  const senderDomainFlag = process.argv.find((arg) => arg.startsWith("--sender-domain="));
  const senderDomain = senderDomainFlag ? senderDomainFlag.split("=")[1] : undefined;

  runReprocess({
    limit,
    accountEmail,
    category,
    senderDomain
  })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
