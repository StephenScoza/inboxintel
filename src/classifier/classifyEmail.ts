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
    "canva.com",
    "google.com",
    "paniniamerica.net",
    "opentable.com",
    "coinbase.com",
    "quick.md",
    "browserbase.com",
    "akamai.com",
    "pluto.tv",
    "freetaxusa.com",
    "audible.com",
    "amcplus.com",
    "certifiedmaillabels.com",
    "leafwell.com",
    "onedrive.com",
    "peacocktv.com",
    "umusic-online.com",
    "nikeshoebot.com",
    "tubitv.com",
    "calm.com",
    "amazon.com",
    "alexa.com",
    "ebay.com"
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
    "experian.com",
    "earnin.com",
    "paypal.com",
    "venmo.com",
    "zellepay.com"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isGovernmentDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return ["fbi.gov", "irs.gov", "ssa.gov", "pa.gov", "nj.gov"].some(
    (domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`)
  );
}

function isEducationDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return senderDomain === "edu" || senderDomain.endsWith(".edu");
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
    "conference registration",
    "clinical webinar",
    "upcoming webinars",
    "webinar",
    "join us",
    "giving day",
    "support students"
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
    "homedepot.com",
    "ihop.com",
    "liquid-iv.com",
    "targetoptical.com",
    "snipesusa.com",
    "topcashback.com",
    "panerabread.com",
    "starbucks.com",
    "simon.com",
    "thecheesecakefactory.com",
    "whiteowlcigar.com",
    "vitacoco.com",
    "vitacost.com",
    "yeezy.com",
    "pandora.net",
    "sneakersnstuff.com",
    "stadiumgoods.com",
    "steelseries.com",
    "blackyachtrock.com",
    "beaspunge.com",
    "booksy.net",
    "jjjjound.com",
    "umusic-online.com",
    "umzu.com",
    "taylorswift.com",
    "ebay.com",
    "ericemanuel.com",
    "curaleaf.com",
    "alias.org",
    "travisscott.com",
    "corteiz.com",
    "libertycannabis.com",
    "instacartemail.com"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isTravelDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "enterprise.com",
    "customer.em.com",
    "visa.vfsevisa.com",
    "vfsevisa.com",
    "aaa-cluballiance.com",
    "royalcaribbean.com",
    "royalcaribbeanmarketing.com",
    "spirit-airlines.com"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isHealthcareDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return [
    "quick.md",
    "leafwell.com",
    "umzu.com",
    "optum.com",
    "cvs.com",
    "plannedparenthood.org"
  ].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function isPayrollDomain(senderDomain: string | null): boolean {
  if (!senderDomain) {
    return false;
  }

  return ["insperityservices.com", "adp.com", "paychex.com"].some(
    (domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`)
  );
}

function filterFreeTrialMatches(
  matches: ExtractedSignals["freeTrial"],
  senderDomain: string | null,
  likelyMarketing: boolean
): ExtractedSignals["freeTrial"] {
  const socialSender = isSocialDomain(senderDomain);
  const commerceSender = isCommerceDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();
    const hasLifecycleContext = hasAnyKeyword(context, [
      "trial ends",
      "trial ending",
      "trial expires",
      "trial will end",
      "trial period",
      "renews",
      "billing",
      "cancel",
      "paid plan",
      "continue after"
    ]);
    const looksRetailTrial = hasAnyKeyword(context, [
      "trial size",
      "sample",
      "beauty insider",
      "free gift",
      "shop now",
      "new arrivals"
    ]);

    if (hasLifecycleContext) {
      return true;
    }

    if (looksRetailTrial || socialSender) {
      return false;
    }

    return !(likelyMarketing && commerceSender);
  });
}

function filterReceiptMatches(
  matches: ExtractedSignals["paymentReceipt"],
  senderDomain: string | null,
  likelyMarketing: boolean
): ExtractedSignals["paymentReceipt"] {
  const commerceSender = isCommerceDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();

    if (match.phrase === "receipt") {
      if (likelyMarketing && hasAnyKeyword(context, ["coupon", "coupons", "reward", "offer", "promo", "claim"])) {
        return false;
      }

      return hasAnyKeyword(context, [
        "purchase",
        "transaction",
        "payment",
        "charged",
        "invoice",
        "order total",
        "order number",
        "paid",
        "refund"
      ]);
    }

    if (match.phrase === "billing receipt") {
      return true;
    }

    return !(likelyMarketing && commerceSender && hasAnyKeyword(context, ["coupon", "reward", "offer", "promo"]));
  });
}

function filterSecurityMatches(
  matches: ExtractedSignals["security"],
  senderDomain: string | null,
  likelyMarketing: boolean,
  subject: string | null
): ExtractedSignals["security"] {
  const financialSender = isFinancialDomain(senderDomain);
  const subjectText = (subject ?? "").toLowerCase();

  return matches.filter((match) => {
    const context = match.context.toLowerCase();

    if (match.phrase === "suspicious activity") {
      const looksLikeRealSecurityAlert =
        hasAnyKeyword(context, [
        "suspicious activity on your account",
        "account alert",
        "sign-in",
        "login",
        "password",
        "device",
        "fraud",
        "security alert",
        "unrecognized"
        ]) || hasAnyKeyword(subjectText, ["security alert", "suspicious activity", "account alert", "login attempt"]);
      const looksLikeMarketing = hasAnyKeyword(context, [
        "refer friends",
        "rewards points",
        "earn $",
        "last chance",
        "bonus",
        "upgrade your savings",
        "credit score monitoring"
      ]) || hasAnyKeyword(subjectText, ["refer friends", "rewards", "bonus", "upgrade your savings"]);

      if (likelyMarketing && looksLikeMarketing) {
        return false;
      }

      return looksLikeRealSecurityAlert;
    }

    if (match.phrase === "payment scams") {
      return !likelyMarketing && financialSender;
    }

    return true;
  });
}

function filterEducationMatches(matches: ExtractedSignals["education"]): ExtractedSignals["education"] {
  return matches.filter((match) => {
    const context = match.context.toLowerCase();

    if (match.phrase === "course") {
      return hasAnyKeyword(context, [
        "course schedule",
        "online course",
        "course starts",
        "student",
        "instructor",
        "certificate",
        "curriculum",
        "class"
      ]);
    }

    return true;
  });
}

function filterSubscriptionMatches(
  matches: ExtractedSignals["subscription"],
  senderDomain: string | null,
  likelyMarketing: boolean
): ExtractedSignals["subscription"] {
  const commerceSender = isCommerceDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();

    if (match.phrase === "membership") {
      return hasAnyKeyword(context, [
        "membership renew",
        "membership fee",
        "membership billed",
        "membership plan",
        "membership charge",
        "manage membership"
      ]);
    }

    if (match.phrase === "subscription") {
      return hasAnyKeyword(context, [
        "subscription renew",
        "subscription fee",
        "subscription billed",
        "subscription charge",
        "subscription plan",
        "manage subscription",
        "cancel subscription"
      ]);
    }

    return !(
      likelyMarketing &&
      commerceSender &&
      hasAnyKeyword(context, ["reward", "badge", "status update", "cash back", "shop", "deal"])
    );
  });
}

function filterShoppingMatches(
  matches: ExtractedSignals["shopping"],
  senderDomain: string | null
): ExtractedSignals["shopping"] {
  const productSender = isProductNewsletterDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();

    if (match.phrase === "lineup" && productSender) {
      return !hasAnyKeyword(context, ["stream", "watch", "watchlist", "episodes", "titles", "binge"]);
    }

    return true;
  });
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
  senderDomain: string | null,
  likelyMarketing: boolean
): ExtractedSignals["shipping"] {
  const hasPurchaseLabel = labels.includes("CATEGORY_PURCHASES");
  const shippingDomain = isShippingDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();
    if (match.phrase === "shipment") {
      return (
        hasPurchaseLabel ||
        shippingDomain ||
        hasAnyKeyword(context, [
          "shipment tracking",
          "track shipment",
          "shipment is on the way",
          "your shipment",
          "package",
          "carrier",
          "tracking number",
          "order shipment"
        ])
      );
    }

    if (match.phrase === "shipped") {
      if (
        likelyMarketing &&
        !shippingDomain &&
        !hasPurchaseLabel &&
        hasAnyKeyword(context, ["get samsung", "stream", "watch", "offer", "deal", "promo"])
      ) {
        return false;
      }

      return (
        hasPurchaseLabel ||
        shippingDomain ||
        hasAnyKeyword(context, [
          "your order has shipped",
          "item has shipped",
          "package shipped",
          "shipped to",
          "tracking number",
          "order details"
        ])
      );
    }

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

function filterGovernmentMatches(
  matches: ExtractedSignals["government"],
  senderDomain: string | null,
  likelyMarketing: boolean
): ExtractedSignals["government"] {
  const governmentSender = isGovernmentDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();

    if (match.phrase === "dmv") {
      return governmentSender || hasAnyKeyword(context, [
        "driver license",
        "drivers license",
        "motor vehicles",
        "vehicle registration",
        "license renewal",
        "state id"
      ]);
    }

    if (match.phrase === "medicare" || match.phrase === "medicaid") {
      if (governmentSender) {
        return true;
      }

      return hasAnyKeyword(context, [
        "coverage",
        "benefits",
        "enrollment",
        "provider",
        "insurance plan",
        "health plan"
      ]) && !likelyMarketing;
    }

    if (match.phrase === "irs" || match.phrase === "state tax" || match.phrase === "tax refund") {
      return governmentSender || hasAnyKeyword(context, ["tax return", "tax filing", "refund status", "irs"]);
    }

    return true;
  });
}

function filterTravelMatches(
  matches: ExtractedSignals["travel"],
  senderDomain: string | null,
  likelyMarketing: boolean
): ExtractedSignals["travel"] {
  const travelSender = isTravelDomain(senderDomain);

  return matches.filter((match) => {
    const context = match.context.toLowerCase();

    if (match.phrase === "rental" || match.phrase === "reservation") {
      return travelSender || hasAnyKeyword(context, [
        "car rental",
        "hotel reservation",
        "flight reservation",
        "travel itinerary",
        "pickup location",
        "drop-off",
        "airport"
      ]);
    }

    if (match.phrase === "trip") {
      return !likelyMarketing || travelSender || hasAnyKeyword(context, ["travel", "vacation", "itinerary", "flight"]);
    }

    return true;
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
  const filteredEducationMatches = filterEducationMatches(input.signals.education);
  const filteredFreeTrialMatches = filterFreeTrialMatches(
    input.signals.freeTrial,
    input.senderDomain,
    input.signals.likelyMarketing
  );
  const filteredReceiptMatches = filterReceiptMatches(
    input.signals.paymentReceipt,
    input.senderDomain,
    input.signals.likelyMarketing
  );
  const filteredGovernmentMatches = filterGovernmentMatches(
    input.signals.government,
    input.senderDomain,
    input.signals.likelyMarketing
  );
  const filteredSecurityMatches = filterSecurityMatches(
    input.signals.security,
    input.senderDomain,
    input.signals.likelyMarketing,
    input.subject
  );
  const filteredShippingMatches = filterShippingMatches(
    input.signals.shipping,
    input.labels,
    input.senderDomain,
    input.signals.likelyMarketing
  );
  const filteredShoppingMatches = filterShoppingMatches(input.signals.shopping, input.senderDomain);
  const filteredSubscriptionMatches = filterSubscriptionMatches(
    input.signals.subscription,
    input.senderDomain,
    input.signals.likelyMarketing
  );
  const filteredTravelMatches = filterTravelMatches(
    input.signals.travel,
    input.senderDomain,
    input.signals.likelyMarketing
  );
  const bankingHits = filteredBankingMatches.map((match) => match.phrase);
  const billHits = input.signals.bill.map((match) => match.phrase);
  const travelHits = filteredTravelMatches.map((match) => match.phrase);
  const jobHits = input.signals.job.map((match) => match.phrase);
  const jobSubjectHits = detectJobSubjectSignals(input.subject);
  const strongJobSignal =
    jobSubjectHits.length > 0 ||
    (jobHits.length > 0 && (jobSubjectHits.length > 0 || isJobPlatformDomain(input.senderDomain)));
  const healthcareHits = input.signals.healthcare.map((match) => match.phrase);
  const governmentHits = filteredGovernmentMatches.map((match) => match.phrase);
  const educationHits = filteredEducationMatches.map((match) => match.phrase);
  const educationEventHits = detectEducationEventSignals(combinedText);
  const strongEducationSignal = educationHits.length > 0 || educationEventHits.length >= 2;
  const socialHits = input.signals.social.map((match) => match.phrase);
  const newsletterHits = input.signals.newsletter.map((match) => match.phrase);
  const smsHits = input.signals.sms.map((match) => match.phrase);
  const shoppingHits = filteredShoppingMatches.map((match) => match.phrase);
  const freeTrialHits = filteredFreeTrialMatches.map((match) => match.phrase);
  const renewalHits = input.signals.renewal.map((match) => match.phrase);
  const receiptHits = filteredReceiptMatches.map((match) => match.phrase);
  const priceIncreaseHits = input.signals.priceIncrease.map((match) => match.phrase);
  const failedPaymentHits = input.signals.failedPayment.map((match) => match.phrase);
  const raffleHits = input.signals.raffle.map((match) => match.phrase);
  const opportunityHits = input.signals.opportunity.map((match) => match.phrase);
  const shippingHits = filteredShippingMatches.map((match) => match.phrase);
  const securityHits = filteredSecurityMatches.map((match) => match.phrase);
  const subscriptionHits = filteredSubscriptionMatches.map((match) => match.phrase);
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
        "banking",
        "banking needs",
        "credit",
        "credit score",
        "credit scores",
        "credit limit",
        "insurance",
        "life insurance",
        "term life insurance",
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
  const likelyTravelFallback =
    isTravelDomain(input.senderDomain) &&
    (travelHits.length > 0 ||
      hasAnyKeyword(combinedText, ["rental", "visa", "evisa", "check-in", "roadside", "cruise", "voyage", "sailing"]));
  const likelyHealthcareFallback =
    isHealthcareDomain(input.senderDomain) &&
    hasAnyKeyword(combinedText, [
      "health",
      "wellness",
      "pharmacy",
      "prescription",
      "doctor",
      "medical",
      "glasses",
      "vision",
      "belly",
      "symptom"
    ]);
  const likelyPayrollFallback =
    isPayrollDomain(input.senderDomain) &&
    hasAnyKeyword(combinedText, ["epaystub", "paystub", "pay stub", "view paycheck", "pay statement"]);
  const likelyGovernmentFallback =
    isGovernmentDomain(input.senderDomain) &&
    hasAnyKeyword(combinedText, ["identity history", "summary request", "fingerprint", "identity request"]);
  const likelyEducationFallback =
    isEducationDomain(input.senderDomain) &&
    hasAnyKeyword(combinedText, [
      "university",
      "college",
      "student",
      "campus",
      "alumni",
      "giving day",
      "financial aid",
      "department",
      "engineering"
    ]);
  const likelyClinicalEducationFallback =
    input.senderDomain !== null &&
    input.senderDomain.endsWith(".broadcastmed.com") &&
    hasAnyKeyword(combinedText, ["clinical", "webinar", "join us", "continuing education", "educational"]);
  const likelyMarketplaceFallback =
    input.senderDomain !== null &&
    (
      input.senderDomain === "members.ebay.com" ||
      input.senderDomain.endsWith(".members.ebay.com") ||
      input.senderDomain === "alias.org" ||
      input.senderDomain.endsWith(".alias.org")
    ) &&
    hasAnyKeyword(combinedText, ["sent a message", "item", "size", "brand new", "in box", "sold", "confirm order"]);
  const closestDate = detectClosestDate(input.dates);
  const likelyProductDomainFallback =
    isProductNewsletterDomain(input.senderDomain) &&
    hasAnyKeyword(combinedText, [
      "memory",
      "memories",
      "watchlist",
      "feature",
      "update",
      "what's new",
      "recommendation",
      "discover",
      "weekly",
      "digest"
    ]);
  const directOneDriveMemoryFallback =
    input.senderDomain !== null &&
    (input.senderDomain === "onedrive.com" || input.senderDomain.endsWith(".onedrive.com")) &&
    hasAnyKeyword(combinedText, ["over the years", "photo memories", "memory"]);
  const directGovernmentFallback =
    input.senderDomain !== null &&
    (input.senderDomain === "services.fbi.gov" || input.senderDomain.endsWith(".fbi.gov"));
  const directMarketplaceFallback =
    input.senderDomain !== null &&
    (input.senderDomain === "members.ebay.com" || input.senderDomain.endsWith(".members.ebay.com"));
  const directSellerNewsFallback =
    input.senderDomain !== null &&
    (input.senderDomain === "information.ebay.com" || input.senderDomain.endsWith(".information.ebay.com")) &&
    hasAnyKeyword(combinedText, ["seller news", "seller update", "ebay seller"]);
  const directAlexaFallback =
    input.senderDomain !== null &&
    (
      input.senderDomain === "amazon.com" ||
      input.senderDomain.endsWith(".amazon.com") ||
      input.senderDomain === "alexa.com" ||
      input.senderDomain.endsWith(".alexa.com")
    ) &&
    hasAnyKeyword(combinedText, ["alexa+", "partner with alexa", "browser", "unlimited access"]);
  const directStreamingPromoFallback =
    input.senderDomain !== null &&
    (
      input.senderDomain.endsWith(".pluto.tv") ||
      input.senderDomain.endsWith(".xfinity.com")
    ) &&
    (
      input.signals.likelyMarketing ||
      hasAnyKeyword(combinedText, ["movies", "tv", "stream", "watch", "multiview", "fan view", "odds zone", "nba"])
    );
  const directUberSecurityFallback =
    input.senderDomain !== null &&
    (input.senderDomain === "uber.com" || input.senderDomain.endsWith(".uber.com")) &&
    (
      hasAnyKeyword(combinedText, ["new device sign-in", "signed into from a new device", "sign-in country", "sign-in city"]) ||
      (input.subject?.toLowerCase().includes("sign-in") ?? false)
    );
  const directExperianSecurityFallback =
    input.senderDomain !== null &&
    input.senderDomain.endsWith(".experian.com") &&
    (
      hasAnyKeyword(combinedText, ["dark web", "your info exposed", "we found your info"]) ||
      (input.subject?.toLowerCase().includes("dark web") ?? false)
    );
  const directFirecrawlSignupFallback =
    input.senderDomain !== null &&
    (input.senderDomain === "firecrawl.dev" || input.senderDomain.endsWith(".firecrawl.dev")) &&
    (
      hasAnyKeyword(combinedText, ["confirm your signup", "confirm your email", "verify", "auth/callback"]) ||
      (input.subject?.toLowerCase().includes("confirm your signup") ?? false)
    );
  const directFirecrawlProductFallback =
    input.senderDomain !== null &&
    (input.senderDomain === "firecrawl.dev" || input.senderDomain.endsWith(".firecrawl.dev")) &&
    (
      input.signals.likelyMarketing ||
      hasAnyKeyword(combinedText, ["get the most out of firecrawl", "search results", "scrape", "crawl", "api", "features"])
    );
  const directIntuitPromoFallback =
    input.senderDomain !== null &&
    input.senderDomain.endsWith(".intuit.com") &&
    (
      input.signals.likelyMarketing ||
      hasAnyKeyword(combinedText, ["fun facts", "trivia game", "trivia facts", "play this"])
    );
  const directSpiritTravelFallback =
    input.senderDomain !== null &&
    input.senderDomain.endsWith(".spirit-airlines.com");
  const directHealthcarePolicyFallback =
    hasAnyKeyword(combinedText, ["planned parenthood", "ppkeystone", "cost of care", "sliding scale"]) ||
    (
      hasAnyKeyword(combinedText, ["medicaid", "patients"]) &&
      hasAnyKeyword(combinedText, ["important changes", "fee", "fees", "cost", "pricing", "charges"])
    );
  const directPersonalForwardFallback =
    input.labels.includes("CATEGORY_PERSONAL") &&
    (input.subject?.toLowerCase().startsWith("fw:") || input.subject?.toLowerCase().startsWith("fwd:") || false);
  const directPersonalLabelFallback =
    input.labels.includes("CATEGORY_PERSONAL") &&
    !input.signals.likelyMarketing;
  const directSentPersonalFallback =
    input.labels.includes("SENT") &&
    !input.signals.likelyMarketing;
  const directRetailPromoDomainFallback =
    input.senderDomain !== null &&
    (
      input.senderDomain.endsWith(".curaleaf.com") ||
      input.senderDomain === "ericemanuel.com" ||
      input.senderDomain.endsWith(".ericemanuel.com")
    ) &&
    input.signals.likelyMarketing;
  const strongFreeTrialSignal =
    freeTrialHits.length > 0 &&
    (renewalHits.length > 0 ||
      closestDate?.kind === "TRIAL_END" ||
      hasAnyKeyword(combinedText, [
        "trial ends",
        "trial ending",
        "trial expires",
        "trial will end",
        "free trial ends",
        "your trial ends"
      ]));
  const strongSecuritySignal =
    securityHits.length > 0 &&
    (!input.signals.likelyMarketing ||
      hasAnyKeyword(combinedText, [
        "account",
        "sign-in",
        "login",
        "password",
        "device",
        "verification",
        "verify",
        "security alert"
      ]));
  const strongReceiptSignal =
    receiptHits.length > 0 &&
    (!input.signals.likelyMarketing ||
      hasAnyKeyword(combinedText, [
        "order",
        "purchase",
        "payment",
        "transaction",
        "charged",
        "invoice",
        "refund",
        "receipt is attached"
      ]));
  const likelySubscriptionSignal =
    subscriptionHits.length > 0 ||
    freeTrialHits.length > 0 ||
    renewalHits.length > 0 ||
    hasAnyKeyword(combinedText, [
      "cancel anytime",
      "billing period",
      "monthly plan",
      "annual plan",
      "subscription renews",
      "membership renews"
    ]);

  const reasons: string[] = [];
  let category: Category = Category.UNKNOWN;
  let urgencyScore = 10;
  let opportunityScore = 5;
  let confidence = 45;
  const alertTypes = new Set<AlertType>();

  if (strongSecuritySignal || directUberSecurityFallback || directExperianSecurityFallback || directFirecrawlSignupFallback) {
    category = Category.ACCOUNT_SECURITY;
    reasons.push(
      directUberSecurityFallback || directExperianSecurityFallback || directFirecrawlSignupFallback
        ? `Matched security sender fallback: ${input.senderDomain}`
        : `Matched security keywords: ${securityHits.join(", ")}`
    );
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
  } else if (strongFreeTrialSignal) {
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
  } else if (strongReceiptSignal) {
    category = Category.PAYMENT_RECEIPT;
    reasons.push(`Matched payment receipt keywords: ${receiptHits.join(", ")}`);
    urgencyScore = 40;
    opportunityScore = 48;
    confidence = 88;
  } else if (likelyPayrollFallback) {
    category = Category.PAYMENT_RECEIPT;
    reasons.push(`Matched payroll sender fallback: ${input.senderDomain}`);
    urgencyScore = 34;
    opportunityScore = 22;
    confidence = 82;
  } else if (shippingHits.length) {
    category = Category.ORDER_OR_SHIPPING;
    reasons.push(`Matched order or shipping keywords: ${dedupePhrases(shippingHits).join(", ")}`);
    urgencyScore = 50;
    opportunityScore = 25;
    confidence = 87;
  } else if (likelyTravelFallback) {
    category = Category.TRAVEL;
    reasons.push(`Matched travel sender fallback: ${input.senderDomain}`);
    urgencyScore = 42;
    opportunityScore = 18;
    confidence = 82;
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
  } else if (likelyHealthcareFallback || directHealthcarePolicyFallback) {
    category = Category.HEALTHCARE;
    reasons.push(
      directHealthcarePolicyFallback
        ? "Matched healthcare policy-change context."
        : `Matched healthcare sender fallback: ${input.senderDomain}`
    );
    urgencyScore = 40;
    opportunityScore = 18;
    confidence = 78;
  } else if (healthcareHits.length) {
    category = Category.HEALTHCARE;
    reasons.push(`Matched healthcare keywords: ${healthcareHits.join(", ")}`);
    urgencyScore = 56;
    opportunityScore = 16;
    confidence = 83;
  } else if (directGovernmentFallback || likelyGovernmentFallback) {
    category = Category.GOVERNMENT;
    reasons.push(`Matched government sender fallback: ${input.senderDomain}`);
    urgencyScore = 58;
    opportunityScore = 10;
    confidence = 84;
  } else if (governmentHits.length && !socialDomain) {
    category = Category.GOVERNMENT;
    reasons.push(`Matched government keywords: ${governmentHits.join(", ")}`);
    urgencyScore = 62;
    opportunityScore = 12;
    confidence = 82;
  } else if (
    (strongEducationSignal || likelyEducationFallback || likelyClinicalEducationFallback) &&
    !(input.signals.labelSignals.includes("CATEGORY_PROMOTIONS") && isCommerceDomain(input.senderDomain) && educationEventHits.length === 0)
  ) {
    category = Category.EDUCATION;
    reasons.push(
      strongEducationSignal
        ? `Matched education signals: ${dedupePhrases([...educationHits, ...educationEventHits]).join(", ")}`
        : likelyClinicalEducationFallback
          ? `Matched clinical education sender fallback: ${input.senderDomain}`
          : `Matched education sender fallback: ${input.senderDomain}`
    );
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
  } else if (directMarketplaceFallback || directSellerNewsFallback || likelyMarketplaceFallback) {
    category = Category.SHOPPING;
    reasons.push(
      directSellerNewsFallback
        ? `Matched marketplace seller-news fallback: ${input.senderDomain}`
        : `Matched marketplace sender fallback: ${input.senderDomain}`
    );
    urgencyScore = 22;
    opportunityScore = 34;
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
  } else if (likelySubscriptionSignal) {
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
  } else if (directRetailPromoDomainFallback) {
    category = Category.RETAIL_PROMO;
    reasons.push(`Matched retail promo sender fallback: ${input.senderDomain}`);
    urgencyScore = 14;
    opportunityScore = 24;
    confidence = 76;
  } else if (strongSocialSignal) {
    category = Category.SOCIAL_OR_COMMUNITY;
    reasons.push(`Matched social or community signals: ${dedupePhrases(socialHits).join(", ") || input.senderDomain || "social sender"}`);
    urgencyScore = 28;
    opportunityScore = 24;
    confidence = 84;
  } else if (strongNewsletterSignal || directAlexaFallback || directStreamingPromoFallback || directFirecrawlProductFallback || directIntuitPromoFallback) {
    category = Category.PRODUCT_OR_NEWSLETTER;
    reasons.push(
      directAlexaFallback || directStreamingPromoFallback || directFirecrawlProductFallback || directIntuitPromoFallback
        ? `Matched product sender fallback: ${input.senderDomain}`
        : `Matched newsletter or product update signals: ${dedupePhrases(newsletterHits).join(", ") || input.senderDomain || "product sender"}`
    );
    urgencyScore = 20;
    opportunityScore = input.signals.likelyMarketing ? 30 : 18;
    confidence = 80;
  } else if (directSpiritTravelFallback) {
    category = Category.TRAVEL;
    reasons.push(`Matched airline sender fallback: ${input.senderDomain}`);
    urgencyScore = 28;
    opportunityScore = 18;
    confidence = 78;
  } else if (directOneDriveMemoryFallback || likelyProductDomainFallback) {
    category = Category.PRODUCT_OR_NEWSLETTER;
    reasons.push(`Matched product sender fallback: ${input.senderDomain}`);
    urgencyScore = 18;
    opportunityScore = 16;
    confidence = 78;
  } else if (
    isShippingDomain(input.senderDomain) &&
    hasAnyKeyword(combinedText, ["package pickup request", "pickup request", "mailpiece", "package pickup"])
  ) {
    category = Category.ORDER_OR_SHIPPING;
    reasons.push(`Matched shipping sender fallback: ${input.senderDomain}`);
    urgencyScore = 46;
    opportunityScore = 18;
    confidence = 82;
  } else if (input.senderDomain && /gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|live\.com|msn\.com|icloud\.com/i.test(input.senderDomain)) {
    category = Category.PERSONAL;
    reasons.push(
      directPersonalLabelFallback
        ? "Sender uses a common personal mailbox domain and Gmail labeled it personal."
        : directSentPersonalFallback
          ? "Sender uses a common personal mailbox domain and the email is from the Sent mailbox."
        : "Sender uses a common personal mailbox domain."
    );
    urgencyScore = 15;
    opportunityScore = 10;
    confidence = directPersonalLabelFallback ? 74 : directSentPersonalFallback ? 72 : 68;
  } else if (directPersonalForwardFallback) {
    category = Category.PERSONAL;
    reasons.push("Gmail marked this as personal and the subject looks like a forwarded conversation.");
    urgencyScore = 18;
    opportunityScore = 10;
    confidence = 76;
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
        freeTrial: filteredFreeTrialMatches,
        renewal: input.signals.renewal,
        paymentReceipt: filteredReceiptMatches,
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
        education: filteredEducationMatches,
        social: input.signals.social,
        newsletter: input.signals.newsletter,
        sms: input.signals.sms,
        shopping: input.signals.shopping,
        shipping: filteredShippingMatches,
        security: filteredSecurityMatches,
        subscription: filteredSubscriptionMatches
      },
      primaryAmount: input.amounts[0] ?? null,
      primaryDate: closestDate?.iso ?? null
    },
    alertTypes: Array.from(alertTypes)
  };
}
