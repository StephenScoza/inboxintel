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

function isSocialDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "linkedin.com",
    "linkedinmail.com",
    "nextdoor.com",
    "facebookmail.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "discord.com"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isShippingDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "usps.com",
    "informeddelivery.usps.com",
    "ups.com",
    "fedex.com",
    "dhl.com",
    "ontrac.com",
    "lasership.com",
    "shop.app",
    "route.com"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isVoiceRelayDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return ["google.com", "txt.voice.google.com", "voice.google.com"]
    .some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isProductNewsletterDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "openai.com",
    "proxyscrape.com",
    "firecrawl.dev",
    "firecrawl.com",
    "google.com",
    "paniniamerica.net",
    "opentable.com",
    "coinbase.com",
    "quick.md",
    "akamai.com",
    "peacocktv.com",
    "umusic-online.com"
  ]
    .some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isFinancialDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "capitalone.com",
    "capitalonebank.com",
    "chase.com",
    "bankofamerica.com",
    "bofa.com",
    "americanexpress.com",
    "discover.com",
    "wellsfargo.com",
    "citibank.com",
    "citi.com",
    "sofi.org",
    "sofi.com",
    "creditkarma.com",
    "creditwise.capitalone.com",
    "paypal.com",
    "venmo.com",
    "zellepay.com"
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

function detectEducationEventSignals(text: string): string[] {
  return containsAny(text, [
    "registration is open",
    "registration is now open",
    "register by",
    "early bird discount",
    "educational sessions",
    "peer learning",
    "virtual registration",
    "continuing education",
    "conference registration"
  ]);
}

function isCommerceDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "sephora.com",
    "macys.com",
    "bathandbodyworks.com",
    "chipotle.com",
    "coldstonecreamery.com",
    "groupon.com",
    "snipesusa.com",
    "topcashback.com",
    "panerabread.com",
    "vitacoco.com",
    "vitacost.com",
    "yeezy.com",
    "pandora.net",
    "sneakersnstuff.com",
    "stadiumgoods.com",
    "steelseries.com",
    "umusic-online.com",
    "libertycannabis.com"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function dedupePhrases(values: string[]): string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function hasAnyKeyword(text: string, phrases: string[]): boolean {
  return containsAny(text, phrases).length > 0;
}

function isWeakSocialPhrase(phrase: string): boolean {
  return ["invitation", "reaction"].includes(phrase);
}

function filterShippingMatches(
  matches: ExtractedSignals["shipping"],
  labels: string[],
  senderDomain: string | null
): ExtractedSignals["shipping"] {
  const hasPurchaseLabel = labels.includes("CATEGORY_PURCHASES");
  const shippingDomain = isShippingDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();
    if (match.phrase === "tracking") {
      return (
        hasPurchaseLabel ||
        shippingDomain ||
        hasAnyKeyword(context, [
          "tracking number",
          "track package",
          "track your package",
          "shipment tracking",
          "carrier tracking",
          "usps tracking",
          "fedex tracking",
          "ups tracking",
          "mail tracking"
        ])
      );
    }

    if (match.phrase !== "delivered" && match.phrase !== "arriving") {
      return true;
    }

    return (
      hasPurchaseLabel ||
      shippingDomain ||
      hasAnyKeyword(context, [
        "tracking",
        "package",
        "shipment",
        "order",
        "delivery window",
        "carrier",
        "arrives",
        "mailpiece"
      ])
    );
  });
}

function filterBankingMatches(
  matches: ExtractedSignals["banking"],
  senderDomain: string | null
): ExtractedSignals["banking"] {
  return matches.filter((match) => {
    const context = match.context.toLowerCase();
    const fromFinancialSender = isFinancialDomain(senderDomain);

    if (match.phrase === "deposit") {
      return (
        fromFinancialSender ||
        hasAnyKeyword(context, [
          "direct deposit",
          "checking account",
          "savings account",
          "bank account",
          "withdrawal",
          "account balance",
          "available balance"
        ])
      );
    }

    if (match.phrase === "savings account") {
      return fromFinancialSender || hasAnyKeyword(context, ["bank", "checking", "routing", "direct deposit"]);
    }

    return true;
  });
}

function hasStrongSocialSignal(
  socialPhrases: string[],
  senderDomain: string | null,
  likelyMarketing: boolean
): boolean {
  if (isSocialDomain(senderDomain)) {
    return true;
  }

  const meaningfulHits = socialPhrases.filter((phrase) => !isWeakSocialPhrase(phrase));
  if (meaningfulHits.length > 0) {
    return true;
  }

  return !likelyMarketing && socialPhrases.length >= 2;
}

export function classifyEmail(input: ClassificationInput): ClassificationResult {
  const combinedText = [input.subject, input.snippet, input.plainTextBody, input.htmlBody]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const filteredBankingMatches = filterBankingMatches(input.signals.banking, input.senderDomain);
  const filteredShippingMatches = filterShippingMatches(input.signals.shipping, input.labels, input.senderDomain);
  const bankingHits = filteredBankingMatches.map((match) => match.phrase);
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
  const educationEventHits = detectEducationEventSignals(combinedText);
  const strongEducationSignal = educationHits.length > 0 || educationEventHits.length >= 2;
  const socialHits = input.signals.social.map((match) => match.phrase);
  const newsletterHits = input.signals.newsletter.map((match) => match.phrase);
  const smsHits = input.signals.sms.map((match) => match.phrase);
  const shoppingHits = input.signals.shopping.map((match) => match.phrase);
  const freeTrialHits = input.signals.freeTrial.map((match) => match.phrase);
  const renewalHits = input.signals.renewal.map((match) => match.phrase);
  const receiptHits = input.signals.paymentReceipt.map((match) => match.phrase);
  const priceIncreaseHits = input.signals.priceIncrease.map((match) => match.phrase);
  const failedPaymentHits = input.signals.failedPayment.map((match) => match.phrase);
  const raffleHits = input.signals.raffle.map((match) => match.phrase);
  const opportunityHits = input.signals.opportunity.map((match) => match.phrase);
  const shippingHits = filteredShippingMatches.map((match) => match.phrase);
  const securityHits = input.signals.security.map((match) => match.phrase);
  const subscriptionHits = input.signals.subscription.map((match) => match.phrase);
  const retailHits = input.signals.retail.map((match) => match.phrase);
  const urgentHits = input.signals.urgent.map((match) => match.phrase);
  const unsubscribeHits = input.signals.unsubscribe.map((match) => match.phrase);
  const socialDomain = isSocialDomain(input.senderDomain);
  const strongSocialSignal = hasStrongSocialSignal(socialHits, input.senderDomain, input.signals.likelyMarketing);
  const strongNewsletterSignal =
    newsletterHits.length > 0 ||
    input.signals.labelSignals.includes("CATEGORY_UPDATES") ||
    (input.signals.likelyMarketing &&
      !input.signals.likelyTransactional &&
      !bankingHits.length &&
      isProductNewsletterDomain(input.senderDomain));
  const strongSmsSignal =
    smsHits.length > 0 ||
    (isVoiceRelayDomain(input.senderDomain) && Boolean(input.subject?.toLowerCase().includes("text message")));
  const hasUnsubscribeLink = input.signals.unsubscribeLinkCount > 0;
  const financialDomain = isFinancialDomain(input.senderDomain);
  const likelyBankingFallback =
    financialDomain &&
    (bankingHits.length > 0 ||
      hasAnyKeyword(combinedText, [
        "bonus",
        "apr",
        "credit score",
        "checking",
        "savings",
        "cash back",
        "account"
      ]));
  const commercePromoContext =
    input.signals.likelyMarketing &&
    (hasUnsubscribeLink ||
      unsubscribeHits.length > 0 ||
      input.signals.labelSignals.includes("CATEGORY_PROMOTIONS") ||
      isCommerceDomain(input.senderDomain));

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
  } else if (strongSmsSignal) {
    category = Category.SMS_OR_TEXT;
    reasons.push(`Matched SMS or relay signals: ${smsHits.join(", ") || input.senderDomain || "voice relay sender"}`);
    urgencyScore = 38;
    opportunityScore = input.signals.likelyMarketing ? 34 : 14;
    confidence = 86;
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
    reasons.push(`Matched order or shipping keywords: ${dedupePhrases(shippingHits).join(", ")}`);
    urgencyScore = 50;
    opportunityScore = 25;
    confidence = 87;
  } else if (bankingHits.length || likelyBankingFallback) {
    category = Category.BANKING;
    reasons.push(
      bankingHits.length
        ? `Matched banking keywords: ${dedupePhrases(bankingHits).join(", ")}`
        : `Matched financial sender fallback: ${input.senderDomain}`
    );
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
  } else if (strongEducationSignal) {
    category = Category.EDUCATION;
    reasons.push(`Matched education signals: ${dedupePhrases([...educationHits, ...educationEventHits]).join(", ")}`);
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
    category = Category.PAID_RESEARCH_OR_GIG;
    reasons.push(`Matched opportunity keywords: ${opportunityHits.join(", ")}`);
    urgencyScore = 34;
    opportunityScore = 90;
    confidence = 88;
    alertTypes.add(AlertType.HIGH_OPPORTUNITY);
  } else if (socialDomain) {
    category = Category.SOCIAL_OR_COMMUNITY;
    reasons.push(`Matched social sender domain: ${input.senderDomain}`);
    urgencyScore = 28;
    opportunityScore = 24;
    confidence = 88;
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
  } else if (retailHits.length > 0 && commercePromoContext) {
    category = Category.RETAIL_PROMO;
    reasons.push(`Matched retail promo signals: ${retailHits.join(", ")}`);
    urgencyScore = 12;
    opportunityScore = 20;
    confidence = 82;
  } else if (
    shoppingHits.length > 0 &&
    (hasUnsubscribeLink || input.signals.labelSignals.includes("CATEGORY_PROMOTIONS") || isCommerceDomain(input.senderDomain))
  ) {
    category = Category.SHOPPING;
    reasons.push(`Matched commerce shopping signals: ${[...shoppingHits, ...retailHits].filter((value, index, array) => array.indexOf(value) === index).join(", ")}`);
    urgencyScore = 26;
    opportunityScore = 42;
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
  } else if (input.signals.likelyMarketing && isCommerceDomain(input.senderDomain)) {
    category =
      hasUnsubscribeLink || unsubscribeHits.length || input.signals.labelSignals.includes("CATEGORY_PROMOTIONS")
        ? Category.RETAIL_PROMO
        : Category.SHOPPING;
    reasons.push(`Matched commerce-domain fallback: ${input.senderDomain}`);
    urgencyScore = category === Category.RETAIL_PROMO ? 14 : 24;
    opportunityScore = category === Category.RETAIL_PROMO ? 24 : 38;
    confidence = 76;
  } else if (strongSocialSignal) {
    category = Category.SOCIAL_OR_COMMUNITY;
    reasons.push(`Matched social or community signals: ${dedupePhrases(socialHits).join(", ") || input.senderDomain || "social sender"}`);
    urgencyScore = 28;
    opportunityScore = 24;
    confidence = 84;
  } else if (strongNewsletterSignal) {
    category = Category.PRODUCT_OR_NEWSLETTER;
    reasons.push(
      `Matched newsletter or product update signals: ${dedupePhrases(newsletterHits).join(", ") || input.senderDomain || "product sender"}`
    );
    urgencyScore = 20;
    opportunityScore = input.signals.likelyMarketing ? 30 : 18;
    confidence = 80;
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
      educationEventHits,
      socialHits,
      newsletterHits,
      smsHits,
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
        social: input.signals.social,
        newsletter: input.signals.newsletter,
        sms: input.signals.sms,
        shopping: input.signals.shopping,
        shipping: filteredShippingMatches,
        security: input.signals.security
      },
      primaryAmount: input.amounts[0] ?? null,
      primaryDate: closestDate?.iso ?? null
    },
    alertTypes: Array.from(alertTypes)
  };
}
