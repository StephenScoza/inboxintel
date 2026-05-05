import { AlertType, Category } from "@prisma/client";
import { ExtractedAmount } from "../parser/extractAmounts";
import { ExtractedDate } from "../parser/extractDates";
import { KEYWORDS, containsAny } from "./rules";

export interface ClassificationInput {
  subject: string | null;
  snippet: string | null;
  plainTextBody: string | null;
  htmlBody: string | null;
  labels: string[];
  senderDomain: string | null;
  links: { url: string; domain: string | null; text: string | null }[];
  amounts: ExtractedAmount[];
  dates: ExtractedDate[];
}

export interface ClassificationResult {
  category: Category;
  confidence: number;
  urgencyScore: number;
  opportunityScore: number;
  reasons: string[];
  signals: Record<string, unknown>;
  alertTypes: AlertType[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysUntil(iso: string): number | null {
  const date = new Date(iso);
  const now = new Date();
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function detectClosestDate(dates: ExtractedDate[]): { iso: string; daysUntil: number } | null {
  const enriched = dates
    .map((entry) => {
      const remainingDays = daysUntil(entry.iso);
      return remainingDays === null ? null : { iso: entry.iso, daysUntil: remainingDays };
    })
    .filter((value): value is { iso: string; daysUntil: number } => Boolean(value))
    .sort((a, b) => Math.abs(a.daysUntil) - Math.abs(b.daysUntil));

  return enriched[0] ?? null;
}

export function classifyEmail(input: ClassificationInput): ClassificationResult {
  const combinedText = [
    input.subject,
    input.snippet,
    input.plainTextBody,
    input.htmlBody
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const freeTrialHits = containsAny(combinedText, KEYWORDS.freeTrial);
  const renewalHits = containsAny(combinedText, KEYWORDS.renewal);
  const receiptHits = containsAny(combinedText, KEYWORDS.paymentReceipt);
  const priceIncreaseHits = containsAny(combinedText, KEYWORDS.priceIncrease);
  const failedPaymentHits = containsAny(combinedText, KEYWORDS.failedPayment);
  const raffleHits = containsAny(combinedText, KEYWORDS.raffle);
  const shippingHits = containsAny(combinedText, KEYWORDS.shipping);
  const securityHits = containsAny(combinedText, KEYWORDS.security);
  const subscriptionHits = containsAny(combinedText, KEYWORDS.subscription);
  const retailHits = containsAny(combinedText, KEYWORDS.retail);
  const urgentHits = containsAny(combinedText, KEYWORDS.urgent);
  const unsubscribeHits = containsAny(combinedText, KEYWORDS.unsubscribe);

  const hasUnsubscribeLink = input.links.some((link) => {
    const lowerText = (link.text ?? "").toLowerCase();
    return lowerText.includes("unsubscribe") || link.url.toLowerCase().includes("unsubscribe");
  });

  const closestDate = detectClosestDate(input.dates);
  const reasons: string[] = [];
  let category: Category = Category.UNKNOWN;
  let urgencyScore = 10;
  let opportunityScore = 5;
  let confidence = 45;
  const alertTypes = new Set<AlertType>();

  if (securityHits.length) {
    category = Category.ACCOUNT_SECURITY;
    reasons.push(`Matched security keywords: ${securityHits.join(", ")}`);
    urgencyScore = 90;
    confidence = 92;
    alertTypes.add(AlertType.URGENT_DEADLINE);
  } else if (failedPaymentHits.length) {
    category = Category.FAILED_PAYMENT;
    reasons.push(`Matched failed payment keywords: ${failedPaymentHits.join(", ")}`);
    urgencyScore = 88;
    opportunityScore = 82;
    confidence = 95;
    alertTypes.add(AlertType.FAILED_PAYMENT);
  } else if (priceIncreaseHits.length) {
    category = Category.PRICE_INCREASE;
    reasons.push(`Matched price increase keywords: ${priceIncreaseHits.join(", ")}`);
    urgencyScore = 68;
    opportunityScore = 92;
    confidence = 93;
    alertTypes.add(AlertType.PRICE_INCREASE);
  } else if (freeTrialHits.length) {
    category = Category.FREE_TRIAL;
    reasons.push(`Matched free trial keywords: ${freeTrialHits.join(", ")}`);
    urgencyScore = 75;
    opportunityScore = 78;
    confidence = 92;
    alertTypes.add(AlertType.FREE_TRIAL_ENDING);
  } else if (renewalHits.length) {
    category = Category.RENEWAL_NOTICE;
    reasons.push(`Matched renewal keywords: ${renewalHits.join(", ")}`);
    urgencyScore = 72;
    opportunityScore = 70;
    confidence = 91;
    alertTypes.add(AlertType.RENEWAL_SOON);
  } else if (receiptHits.length) {
    category = Category.PAYMENT_RECEIPT;
    reasons.push(`Matched payment receipt keywords: ${receiptHits.join(", ")}`);
    urgencyScore = 40;
    opportunityScore = 48;
    confidence = 88;
  } else if (shippingHits.length) {
    category = Category.ORDER_OR_SHIPPING;
    reasons.push(`Matched order or shipping keywords: ${shippingHits.join(", ")}`);
    urgencyScore = 50;
    opportunityScore = 25;
    confidence = 87;
  } else if (raffleHits.length) {
    category = Category.RAFFLE_OR_GIVEAWAY;
    reasons.push(`Matched raffle keywords: ${raffleHits.join(", ")}`);
    urgencyScore = 44;
    opportunityScore = 82;
    confidence = 90;
    alertTypes.add(AlertType.RAFFLE_OR_GIVEAWAY);
    alertTypes.add(AlertType.HIGH_OPPORTUNITY);
  } else if (subscriptionHits.length) {
    category = Category.SUBSCRIPTION;
    reasons.push(`Matched subscription keywords: ${subscriptionHits.join(", ")}`);
    urgencyScore = 42;
    opportunityScore = 45;
    confidence = 80;
  } else if ((hasUnsubscribeLink || unsubscribeHits.length) && retailHits.length) {
    category = Category.RETAIL_PROMO;
    reasons.push(`Matched retail promo signals: ${retailHits.join(", ")}`);
    urgencyScore = 12;
    opportunityScore = 20;
    confidence = 82;
  } else if (input.senderDomain && /gmail\.com|yahoo\.com|outlook\.com|icloud\.com/i.test(input.senderDomain)) {
    category = Category.PERSONAL;
    reasons.push("Sender uses a common personal mailbox domain.");
    urgencyScore = 15;
    opportunityScore = 10;
    confidence = 60;
  } else {
    reasons.push("No strong deterministic rule matched.");
  }

  if (urgentHits.length) {
    urgencyScore += 15;
    reasons.push(`Urgency language detected: ${urgentHits.join(", ")}`);
  }

  if (input.amounts.length) {
    opportunityScore += 10;
    reasons.push(`Detected ${input.amounts.length} dollar amount(s).`);
  }

  if (closestDate) {
    reasons.push(`Detected date ${closestDate.iso}.`);
    if (closestDate.daysUntil <= 7 && closestDate.daysUntil >= 0) {
      urgencyScore += 20;
      if (category === Category.FREE_TRIAL) {
        alertTypes.add(AlertType.FREE_TRIAL_ENDING);
      }
      if (category === Category.RENEWAL_NOTICE || category === Category.SUBSCRIPTION) {
        alertTypes.add(AlertType.RENEWAL_SOON);
      }
    }
  }

  if (category === Category.RETAIL_PROMO) {
    opportunityScore = Math.min(opportunityScore, 25);
  }

  return {
    category,
    confidence: clampScore(confidence),
    urgencyScore: clampScore(urgencyScore),
    opportunityScore: clampScore(opportunityScore),
    reasons,
    signals: {
      freeTrialHits,
      renewalHits,
      receiptHits,
      priceIncreaseHits,
      failedPaymentHits,
      raffleHits,
      shippingHits,
      securityHits,
      subscriptionHits,
      retailHits,
      unsubscribeHits,
      hasUnsubscribeLink,
      labels: input.labels,
      primaryAmount: input.amounts[0] ?? null,
      primaryDate: closestDate?.iso ?? null
    },
    alertTypes: Array.from(alertTypes)
  };
}
