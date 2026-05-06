import { Prisma } from "@prisma/client";
import { shouldSuppressAlert } from "../alerts/policy";
import { prisma } from "../db";
import {
  chooseImportantDate,
  chooseSubscriptionAmount,
  determineSubscriptionStatus,
  shouldTrackSubscription
} from "../intelligence/subscriptionFacts";
import { buildEmailIntelligence } from "../intelligence/buildEmailIntelligence";
import { deriveVendorIdentity } from "../intelligence/vendorIdentity";
import { sendDiscordAlert } from "../alerts/discord";
import { sanitizeJsonValue } from "../utils/safeJson";

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

export async function runReprocess(limit?: number) {
  const emails = await prisma.email.findMany({
    include: {
      links: true,
      classification: true,
      gmailAccount: true,
      sender: true
    },
    orderBy: {
      receivedAt: "desc"
    },
    take: limit
  });

  let updated = 0;

  for (const email of emails) {
    const intelligence = buildEmailIntelligence({
      subject: email.subject,
      snippet: email.snippet,
      plainTextBody: email.plainTextBody,
      htmlBody: email.htmlBody,
      labels: email.gmailLabels,
      senderDomain: email.senderDomain,
      links: email.links.map((link) => ({
        url: link.url,
        domain: link.domain,
        text: link.text
      }))
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
        signalsJson: sanitizeJsonValue(intelligence.classification.signals) as unknown as Prisma.InputJsonValue
      },
      create: {
        emailId: email.id,
        category: intelligence.classification.category,
        confidence: intelligence.classification.confidence,
        urgencyScore: intelligence.classification.urgencyScore,
        opportunityScore: intelligence.classification.opportunityScore,
        reasons: intelligence.classification.reasons,
        signalsJson: sanitizeJsonValue(intelligence.classification.signals) as unknown as Prisma.InputJsonValue
      }
    });

    await prisma.email.update({
      where: { id: email.id },
      data: {
        amountsJson: sanitizeJsonValue(intelligence.amounts) as unknown as Prisma.InputJsonValue,
        datesJson: sanitizeJsonValue(intelligence.dates) as unknown as Prisma.InputJsonValue
      }
    });

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
  }

  console.log(`Reprocessed ${updated} stored email(s).`);
}

if (require.main === module) {
  const limitFlag = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitFlag ? Number(limitFlag.split("=")[1]) : undefined;

  runReprocess(limit)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
