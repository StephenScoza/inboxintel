import { KEYWORDS, containsAny, extractKeywordContexts } from "../classifier/rules";

export interface SignalMatch {
  phrase: string;
  context: string;
}

export interface ExtractedSignals {
  banking: SignalMatch[];
  bill: SignalMatch[];
  travel: SignalMatch[];
  job: SignalMatch[];
  healthcare: SignalMatch[];
  government: SignalMatch[];
  education: SignalMatch[];
  social: SignalMatch[];
  newsletter: SignalMatch[];
  sms: SignalMatch[];
  shopping: SignalMatch[];
  freeTrial: SignalMatch[];
  renewal: SignalMatch[];
  paymentReceipt: SignalMatch[];
  priceIncrease: SignalMatch[];
  failedPayment: SignalMatch[];
  raffle: SignalMatch[];
  opportunity: SignalMatch[];
  shipping: SignalMatch[];
  security: SignalMatch[];
  subscription: SignalMatch[];
  retail: SignalMatch[];
  unsubscribe: SignalMatch[];
  urgent: SignalMatch[];
  linkDomains: string[];
  unsubscribeLinkCount: number;
  labelSignals: string[];
  likelyTransactional: boolean;
  likelyMarketing: boolean;
  likelySubscription: boolean;
}

interface ExtractSignalsInput {
  subject: string | null;
  snippet: string | null;
  plainTextBody: string | null;
  htmlBody: string | null;
  labels: string[];
  links: { url: string; domain: string | null; text: string | null }[];
}

function cleanCombinedText(parts: Array<string | null>): string {
  return parts
    .filter(Boolean)
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeMatches(matches: SignalMatch[]): SignalMatch[] {
  const seen = new Set<string>();
  const deduped: SignalMatch[] = [];

  for (const match of matches) {
    const key = `${match.phrase}|${match.context}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(match);
  }

  return deduped;
}

export function extractSignals(input: ExtractSignalsInput): ExtractedSignals {
  const combinedText = cleanCombinedText([
    input.subject,
    input.snippet,
    input.plainTextBody,
    input.htmlBody
  ]);
  const lower = combinedText.toLowerCase();
  const linkDomains = Array.from(
    new Set(input.links.map((link) => link.domain).filter((value): value is string => Boolean(value)))
  );
  const unsubscribeLinkCount = input.links.filter((link) => {
    const text = (link.text ?? "").toLowerCase();
    return text.includes("unsubscribe") || link.url.toLowerCase().includes("unsubscribe");
  }).length;
  const labelSignals = input.labels.filter((label) =>
    ["CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_PURCHASES", "IMPORTANT"].includes(label)
  );

  const banking = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.banking));
  const bill = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.bill));
  const travel = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.travel));
  const job = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.job));
  const healthcare = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.healthcare));
  const government = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.government));
  const education = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.education));
  const social = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.social));
  const newsletter = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.newsletter));
  const sms = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.sms));
  const shopping = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.shopping));
  const freeTrial = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.freeTrial));
  const renewal = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.renewal));
  const paymentReceipt = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.paymentReceipt));
  const priceIncrease = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.priceIncrease));
  const failedPayment = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.failedPayment));
  const raffle = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.raffle));
  const opportunity = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.opportunity));
  const shipping = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.shipping));
  const security = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.security));
  const subscription = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.subscription));
  const retail = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.retail));
  const unsubscribe = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.unsubscribe));
  const urgent = dedupeMatches(extractKeywordContexts(combinedText, KEYWORDS.urgent));

  const likelyTransactional =
    banking.length > 0 ||
    bill.length > 0 ||
    travel.length > 0 ||
    healthcare.length > 0 ||
    government.length > 0 ||
    education.length > 0 ||
    sms.length > 0 ||
    paymentReceipt.length > 0 ||
    shipping.length > 0 ||
    failedPayment.length > 0 ||
    security.length > 0 ||
    containsAny(lower, ["thank you for your order", "receipt", "invoice", "tracking number"]).length > 0;

  const likelyMarketing =
    shopping.length > 0 ||
    retail.length > 0 ||
    raffle.length > 0 ||
    opportunity.length > 0 ||
    social.length > 0 ||
    newsletter.length > 0 ||
    unsubscribeLinkCount > 0 ||
    labelSignals.includes("CATEGORY_PROMOTIONS");

  const likelySubscription =
    subscription.length > 0 ||
    freeTrial.length > 0 ||
    renewal.length > 0 ||
    containsAny(lower, [
      "cancel anytime",
      "monthly plan",
      "annual plan",
      "membership plan",
      "billing period",
      "subscription renews",
      "membership renews"
    ]).length > 0;

  return {
    banking,
    bill,
    travel,
    job,
    healthcare,
    government,
    education,
    social,
    newsletter,
    sms,
    shopping,
    freeTrial,
    renewal,
    paymentReceipt,
    priceIncrease,
    failedPayment,
    raffle,
    opportunity,
    shipping,
    security,
    subscription,
    retail,
    unsubscribe,
    urgent,
    linkDomains,
    unsubscribeLinkCount,
    labelSignals,
    likelyTransactional,
    likelyMarketing,
    likelySubscription
  };
}
