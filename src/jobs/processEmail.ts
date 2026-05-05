import { AlertType, Category, Prisma } from "@prisma/client";
import { gmail_v1 } from "googleapis";
import { sendDiscordAlert } from "../alerts/discord";
import { prisma } from "../db";
import { buildEmailIntelligence } from "../intelligence/buildEmailIntelligence";
import {
  chooseImportantDate,
  chooseSubscriptionAmount,
  determineSubscriptionStatus,
  shouldTrackSubscription
} from "../intelligence/subscriptionFacts";
import { extractBody } from "../parser/extractBody";
import { extractLinks } from "../parser/extractLinks";

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
  const senderName = match?.[1]?.trim() || null;
  const senderDomain = senderEmail.includes("@") ? senderEmail.split("@")[1] : null;

  return {
    senderRaw: raw,
    senderName,
    senderEmail,
    senderDomain
  };
}

function deriveVendor(senderName: string | null, senderDomain: string | null): { vendor: string; normalized: string } {
  const domainRoot = senderDomain?.split(".")[0] ?? "unknown";
  const vendor = senderName || domainRoot;
  return {
    vendor,
    normalized: vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
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

export async function processEmail(message: gmail_v1.Schema$Message, context: ProcessContext) {
  if (!message.id) {
    return { skipped: true, reason: "missing-message-id" };
  }

  const existing = await prisma.email.findUnique({
    where: { gmailMessageId: message.id }
  });

  if (existing) {
    return { skipped: true, reason: "duplicate" };
  }

  const payload = message.payload;
  const headers = payload?.headers ?? [];
  const subject = getHeader(headers, "Subject");
  const rawSender = getHeader(headers, "From");
  const receivedHeader = getHeader(headers, "Date");
  const senderMeta = parseSender(rawSender);
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate))
    : receivedHeader
      ? new Date(receivedHeader)
      : null;
  const { plainTextBody, htmlBody } = extractBody(payload);
  const links = extractLinks(plainTextBody, htmlBody);
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

  const email = await prisma.email.create({
    data: {
      gmailMessageId: message.id,
      gmailThreadId: message.threadId ?? null,
      gmailInternalAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
      gmailLabels: message.labelIds ?? [],
      senderRaw: senderMeta.senderRaw,
      senderName: senderMeta.senderName,
      senderEmail: senderMeta.senderEmail,
      senderDomain: senderMeta.senderDomain,
      subject,
      snippet: message.snippet ?? null,
      receivedAt,
      plainTextBody,
      htmlBody,
      rawPayload: payload as unknown as Prisma.InputJsonValue,
      amountsJson: intelligence.amounts as unknown as Prisma.InputJsonValue,
      datesJson: intelligence.dates as unknown as Prisma.InputJsonValue,
      gmailAccountId: context.gmailAccountId,
      senderId: sender?.id ?? null,
      links: {
        create: links.map((link) => ({
          url: link.url,
          domain: link.domain,
          text: link.text
        }))
      },
      classification: {
        create: {
          category: intelligence.classification.category,
          confidence: intelligence.classification.confidence,
          urgencyScore: intelligence.classification.urgencyScore,
          opportunityScore: intelligence.classification.opportunityScore,
          reasons: intelligence.classification.reasons,
          signalsJson: intelligence.classification.signals as unknown as Prisma.InputJsonValue
        }
      }
    },
    include: {
      classification: true
    }
  });

  if (shouldTrackSubscription(intelligence.classification.category, intelligence.signals)) {
    const vendor = deriveVendor(senderMeta.senderName, senderMeta.senderDomain);
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
          normalizedVendor: vendor.normalized
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
        normalizedVendor: vendor.normalized,
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
    try {
      const delivery = await sendDiscordAlert({
        alertType,
        category: intelligence.classification.category,
        subject,
        sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
        reason: intelligence.classification.reasons[0] ?? "Alert-worthy email",
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
          reason: intelligence.classification.reasons[0] ?? "Alert-worthy email",
          urgencyScore: intelligence.classification.urgencyScore,
          opportunityScore: intelligence.classification.opportunityScore,
          webhookTarget: delivery.webhookTarget,
          deliveredAt: delivery.deliveredAt,
          payloadJson: delivery.payloadJson as unknown as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      await prisma.alert.create({
        data: {
          emailId: email.id,
          gmailAccountId: context.gmailAccountId,
          type: alertType,
          category: intelligence.classification.category,
          reason: `${intelligence.classification.reasons[0] ?? "Alert-worthy email"} (delivery failed)`,
          urgencyScore: intelligence.classification.urgencyScore,
          opportunityScore: intelligence.classification.opportunityScore,
          webhookTarget: "delivery-failed",
          payloadJson: {
            error: error instanceof Error ? error.message : "Unknown delivery error"
          } as unknown as Prisma.InputJsonValue
        }
      });
    }
  }

  return { skipped: false, emailId: email.id };
}
