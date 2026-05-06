import { AlertType, Category } from "@prisma/client";
import { ExtractedAmount } from "../parser/extractAmounts";
import { ExtractedDate } from "../parser/extractDates";
import { ExtractedSignals } from "../parser/extractSignals";
import { containsAny } from "./rules";

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
  signals: ExtractedSignals;
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

function detectClosestDate(dates: ExtractedDate[]): { iso: string; daysUntil: number; kind: ExtractedDate["kind"] } | null {
  const enriched = dates
    .map((entry) => {
      const remainingDays = daysUntil(entry.iso);
      return remainingDays === null ? null : { iso: entry.iso, daysUntil: remainingDays, kind: entry.kind };
    })
    .filter((value): value is { iso: string; daysUntil: number; kind: ExtractedDate["kind"] } => Boolean(value))
    .sort((a, b) => Math.abs(a.daysUntil) - Math.abs(b.daysUntil));

  return enriched[0] ?? null;
}

function isJobPlatformDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "linkedin.com",
    "linkedinmail.com",
    "indeed.com",
    "indeedemail.com",
    "greenhouse.io",
    "lever.co",
    "myworkdayjobs.com",
    "workday.com",
    "ashbyhq.com",
    "smartrecruiters.com",
    "jobvite.com",
    "ziprecruiter.com",
    "dice.com",
    "wellfound.com",
    "angel.co"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function detectJobSubjectSignals(subject: string | null): string[] {
  if (!subject) {
    return [];
  }

  return containsAny(subject, [
    "software engineer",
    "full stack engineer",
    "full-stack engineer",
    "frontend engineer",
    "backend engineer",
    "web developer",
    "javascript developer",
    "typescript developer",
    "product manager",
    "data analyst",
    "remote",
    "hiring",
    "salary",
    "/hr",
    "per hour"
  ]);
}

export function classifyEmail(input: ClassificationInput): ClassificationResult {
  const bankingHits = input.signals.banking.map((match) => match.phrase);
  const billHits = input.signals.bill.map((match) => match.phrase);
  const travelHits = input.signals.travel.map((match) => match.phrase);
  const jobHits = input.signals.job.map((match) => match.phrase);
  const jobSubjectHits = detectJobSubjectSignals(input.subject);
  const strongJobSignal =
    jobSubjectHits.length > 0 ||
    (jobHits.length > 0 && (jobSubjectHits.length > 0 || isJobPlatformDomain(input.senderDomain)));
  const healthcareHits = input.signals.healthcare.map((match) => match.phrase);
  const governmentHits = input.signals.government.map((match) => match.phrase);
  const educationHits = input.signals.education.map((match) => match.phrase);
  const shoppingHits = input.signals.shopping.map((match) => match.phrase);
  const freeTrialHits = input.signals.freeTrial.map((match) => match.phrase);
  const renewalHits = input.signals.renewal.map((match) => match.phrase);
  const receiptHits = input.signals.paymentReceipt.map((match) => match.phrase);
  const priceIncreaseHits = input.signals.priceIncrease.map((match) => match.phrase);
  const failedPaymentHits = input.signals.failedPayment.map((match) => match.phrase);
  const raffleHits = input.signals.raffle.map((match) => match.phrase);
  const opportunityHits = input.signals.opportunity.map((match) => match.phrase);
  const shippingHits = input.signals.shipping.map((match) => match.phrase);
  const securityHits = input.signals.security.map((match) => match.phrase);
  const subscriptionHits = input.signals.subscription.map((match) => match.phrase);
  const retailHits = input.signals.retail.map((match) => match.phrase);
  const urgentHits = input.signals.urgent.map((match) => match.phrase);
  const unsubscribeHits = input.signals.unsubscribe.map((match) => match.phrase);

  const hasUnsubscribeLink = input.signals.unsubscribeLinkCount > 0;

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
  } else if (strongJobSignal) {
    category = Category.JOB_OR_CAREER;
    reasons.push(
      `Matched strong job signals: ${[...jobHits, ...jobSubjectHits].filter((value, index, array) => array.indexOf(value) === index).join(", ")}`
    );
    if (isJobPlatformDomain(input.senderDomain)) {
      reasons.push(`Recognized recruiting or job platform sender: ${input.senderDomain}.`);
    }
    urgencyScore = 54;
    opportunityScore = 58;
    confidence = 88;
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
  } else if (bankingHits.length) {
    category = Category.BANKING;
    reasons.push(`Matched banking keywords: ${bankingHits.join(", ")}`);
    urgencyScore = 46;
    opportunityScore = 18;
    confidence = 84;
  } else if (billHits.length) {
    category = Category.BILL_OR_UTILITY;
    reasons.push(`Matched bill or utility keywords: ${billHits.join(", ")}`);
    urgencyScore = 58;
    opportunityScore = 32;
    confidence = 85;
  } else if (travelHits.length) {
    category = Category.TRAVEL;
    reasons.push(`Matched travel keywords: ${travelHits.join(", ")}`);
    urgencyScore = 44;
    opportunityScore = 20;
    confidence = 84;
  } else if (healthcareHits.length) {
    category = Category.HEALTHCARE;
    reasons.push(`Matched healthcare keywords: ${healthcareHits.join(", ")}`);
    urgencyScore = 56;
    opportunityScore = 16;
    confidence = 83;
  } else if (governmentHits.length) {
    category = Category.GOVERNMENT;
    reasons.push(`Matched government keywords: ${governmentHits.join(", ")}`);
    urgencyScore = 62;
    opportunityScore = 12;
    confidence = 82;
  } else if (educationHits.length) {
    category = Category.EDUCATION;
    reasons.push(`Matched education keywords: ${educationHits.join(", ")}`);
    urgencyScore = 45;
    opportunityScore = 18;
    confidence = 81;
  } else if (jobHits.length) {
    category = Category.JOB_OR_CAREER;
    reasons.push(`Matched job or career keywords: ${jobHits.join(", ")}`);
    urgencyScore = 52;
    opportunityScore = 54;
    confidence = 82;
  } else if (opportunityHits.length) {
    category = Category.UNKNOWN;
    reasons.push(`Matched opportunity keywords: ${opportunityHits.join(", ")}`);
    urgencyScore = 34;
    opportunityScore = 90;
    confidence = 84;
    alertTypes.add(AlertType.HIGH_OPPORTUNITY);
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
  } else if (
    retailHits.length > 0 &&
    (hasUnsubscribeLink || unsubscribeHits.length || input.signals.labelSignals.includes("CATEGORY_PROMOTIONS"))
  ) {
    category = Category.RETAIL_PROMO;
    reasons.push(`Matched retail promo signals: ${retailHits.join(", ")}`);
    urgencyScore = 12;
    opportunityScore = 20;
    confidence = 82;
  } else if (shoppingHits.length) {
    category = Category.SHOPPING;
    reasons.push(`Matched shopping signals: ${shoppingHits.join(", ")}`);
    urgencyScore = 24;
    opportunityScore = 36;
    confidence = 78;
  } else if (input.signals.likelySubscription) {
    category = Category.SUBSCRIPTION;
    reasons.push("Recurring or subscription language detected.");
    urgencyScore = 48;
    opportunityScore = 52;
    confidence = 78;
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
    const recurringAmount = input.amounts.find((amount) => amount.kind === "RECURRING");
    const chargedAmount = input.amounts.find((amount) => amount.kind === "CHARGE");
    opportunityScore += recurringAmount ? 16 : 10;
    urgencyScore += chargedAmount && category === Category.FAILED_PAYMENT ? 5 : 0;
    reasons.push(`Detected ${input.amounts.length} dollar amount(s).`);
  }

  if (closestDate) {
    reasons.push(`Detected ${closestDate.kind.toLowerCase()} date ${closestDate.iso}.`);
    if (closestDate.daysUntil <= 7 && closestDate.daysUntil >= 0) {
      urgencyScore += 20;
      if (category === Category.FREE_TRIAL) {
        alertTypes.add(AlertType.FREE_TRIAL_ENDING);
      }
      if (category === Category.RENEWAL_NOTICE || category === Category.SUBSCRIPTION) {
        alertTypes.add(AlertType.RENEWAL_SOON);
      }
      if (category === Category.ACCOUNT_SECURITY || urgentHits.length) {
        alertTypes.add(AlertType.URGENT_DEADLINE);
      }
    }
  }

  if (category === Category.RAFFLE_OR_GIVEAWAY && urgentHits.length) {
    alertTypes.add(AlertType.URGENT_DEADLINE);
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
      bankingHits,
      billHits,
      travelHits,
      jobHits,
      healthcareHits,
      governmentHits,
      educationHits,
      shoppingHits,
      jobSubjectHits,
      freeTrialHits,
      renewalHits,
      receiptHits,
      priceIncreaseHits,
      failedPaymentHits,
      raffleHits,
      opportunityHits,
      shippingHits,
      securityHits,
      subscriptionHits,
      retailHits,
      unsubscribeHits,
      hasUnsubscribeLink,
      labels: input.labels,
      labelSignals: input.signals.labelSignals,
      likelyTransactional: input.signals.likelyTransactional,
      likelyMarketing: input.signals.likelyMarketing,
      likelySubscription: input.signals.likelySubscription,
      linkDomains: input.signals.linkDomains,
      signalContexts: {
        freeTrial: input.signals.freeTrial,
        renewal: input.signals.renewal,
        paymentReceipt: input.signals.paymentReceipt,
        priceIncrease: input.signals.priceIncrease,
        failedPayment: input.signals.failedPayment,
        raffle: input.signals.raffle,
        opportunity: input.signals.opportunity,
        banking: input.signals.banking,
        bill: input.signals.bill,
        travel: input.signals.travel,
        job: input.signals.job,
        healthcare: input.signals.healthcare,
        government: input.signals.government,
        education: input.signals.education,
        shopping: input.signals.shopping,
        shipping: input.signals.shipping,
        security: input.signals.security
      },
      primaryAmount: input.amounts[0] ?? null,
      primaryDate: closestDate?.iso ?? null
    },
    alertTypes: Array.from(alertTypes)
  };
}
