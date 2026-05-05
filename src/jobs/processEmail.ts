import { AlertType, Category, Prisma, SubscriptionStatus } from "@prisma/client";
import { gmail_v1 } from "googleapis";
import { prisma } from "../db";
import { sendDiscordAlert } from "../alerts/discord";
import { classifyEmail } from "../classifier/classifyEmail";
import { extractAmounts } from "../parser/extractAmounts";
import { extractBody } from "../parser/extractBody";
import { extractDates } from "../parser/extractDates";
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

function choosePrimaryDate(dates: { iso: string }[]): string | null {
  return dates[0]?.iso ?? null;
}

function deriveVendor(senderName: string | null, senderDomain: string | null): { vendor: string; normalized: string } {
  const domainRoot = senderDomain?.split(".")[0] ?? "unknown";
  const vendor = senderName || domainRoot;
  return {
    vendor,
    normalized: vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  };
}

function determineSubscriptionStatus(category: Category, primaryDate: string | null): SubscriptionStatus {
  if (!primaryDate) {
    return SubscriptionStatus.UNKNOWN;
  }

  const diffMs = new Date(primaryDate).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (category === Category.FAILED_PAYMENT) {
    return SubscriptionStatus.PAST_DUE;
  }

  if (days >= 0 && days <= 7) {
    return SubscriptionStatus.ENDING_SOON;
  }

  if (days > 7) {
    return SubscriptionStatus.ACTIVE;
  }

  return SubscriptionStatus.UNKNOWN;
}

function shouldTrackSubscription(category: Category): boolean {
  const trackedCategories: Category[] = [
    Category.SUBSCRIPTION,
    Category.FREE_TRIAL,
    Category.RENEWAL_NOTICE,
    Category.PAYMENT_RECEIPT,
    Category.PRICE_INCREASE,
    Category.FAILED_PAYMENT
  ];

  return trackedCategories.includes(category);
}

function shouldPromoteHighOpportunity(category: Category, opportunityScore: number): AlertType[] {
  const opportunityCategories: Category[] = [
    Category.PRICE_INCREASE,
    Category.RAFFLE_OR_GIVEAWAY,
    Category.FREE_TRIAL
  ];

  if (
    opportunityCategories.includes(category) &&
    opportunityScore >= 75
  ) {
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
  const combinedText = [subject, message.snippet, plainTextBody].filter(Boolean).join("\n");
  const links = extractLinks(plainTextBody, htmlBody);
  const amounts = extractAmounts(combinedText);
  const dates = extractDates(combinedText);
  const classification = classifyEmail({
    subject,
    snippet: message.snippet ?? null,
    plainTextBody,
    htmlBody,
    labels: message.labelIds ?? [],
    senderDomain: senderMeta.senderDomain,
    links,
    amounts,
    dates
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
      amountsJson: amounts as unknown as Prisma.InputJsonValue,
      datesJson: dates as unknown as Prisma.InputJsonValue,
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
          category: classification.category,
          confidence: classification.confidence,
          urgencyScore: classification.urgencyScore,
          opportunityScore: classification.opportunityScore,
          reasons: classification.reasons,
          signalsJson: classification.signals as unknown as Prisma.InputJsonValue
        }
      }
    },
    include: {
      classification: true
    }
  });

  if (shouldTrackSubscription(classification.category)) {
    const vendor = deriveVendor(senderMeta.senderName, senderMeta.senderDomain);
    const primaryAmount = amounts[0];
    const primaryDate = choosePrimaryDate(dates);
    const status = determineSubscriptionStatus(classification.category, primaryDate);

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
        nextRenewalAt: primaryDate ? new Date(primaryDate) : undefined,
        status,
        confidence: classification.confidence,
        sourceCategory: classification.category,
        lastSeenAt: receivedAt ?? new Date(),
        notes: classification.reasons.join(" | ")
      },
      create: {
        gmailAccountId: context.gmailAccountId,
        senderId: sender?.id ?? null,
        vendor: vendor.vendor,
        normalizedVendor: vendor.normalized,
        amount: primaryAmount ? new Prisma.Decimal(primaryAmount.value) : undefined,
        currency: primaryAmount?.currency ?? "USD",
        nextRenewalAt: primaryDate ? new Date(primaryDate) : null,
        status,
        confidence: classification.confidence,
        sourceCategory: classification.category,
        lastSeenAt: receivedAt ?? new Date(),
        notes: classification.reasons.join(" | ")
      }
    });
  }

  const alertTypes = Array.from(new Set([
    ...classification.alertTypes,
    ...shouldPromoteHighOpportunity(classification.category, classification.opportunityScore)
  ]));
  const primaryAmountLabel = amounts[0] ? `${amounts[0].currency} ${amounts[0].value.toFixed(2)}` : null;
  const primaryDate = choosePrimaryDate(dates);

  for (const alertType of alertTypes) {
    try {
      const delivery = await sendDiscordAlert({
        alertType,
        category: classification.category,
        subject,
        sender: senderMeta.senderEmail ?? senderMeta.senderRaw,
        reason: classification.reasons[0] ?? "Alert-worthy email",
        urgencyScore: classification.urgencyScore,
        opportunityScore: classification.opportunityScore,
        confidence: classification.confidence,
        detectedAmount: primaryAmountLabel,
        detectedDate: primaryDate,
        gmailAccountEmail: context.gmailAccountEmail,
        emailId: email.id
      });

      await prisma.alert.create({
        data: {
          emailId: email.id,
          gmailAccountId: context.gmailAccountId,
          type: alertType,
          category: classification.category,
          reason: classification.reasons[0] ?? "Alert-worthy email",
          urgencyScore: classification.urgencyScore,
          opportunityScore: classification.opportunityScore,
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
          category: classification.category,
          reason: `${classification.reasons[0] ?? "Alert-worthy email"} (delivery failed)`,
          urgencyScore: classification.urgencyScore,
          opportunityScore: classification.opportunityScore,
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
