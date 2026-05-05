import { KEYWORDS, containsAny, extractKeywordContexts } from "../classifier/rules";

export interface SignalMatch {
  phrase: string;
  context: string;
}

export interface ExtractedSignals {
  freeTrial: SignalMatch[];
  renewal: SignalMatch[];
  paymentReceipt: SignalMatch[];
  priceIncrease: SignalMatch[];
  failedPayment: SignalMatch[];
  raffle: SignalMatch[];
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

  const freeTrial = extractKeywordContexts(combinedText, KEYWORDS.freeTrial);
  const renewal = extractKeywordContexts(combinedText, KEYWORDS.renewal);
  const paymentReceipt = extractKeywordContexts(combinedText, KEYWORDS.paymentReceipt);
  const priceIncrease = extractKeywordContexts(combinedText, KEYWORDS.priceIncrease);
  const failedPayment = extractKeywordContexts(combinedText, KEYWORDS.failedPayment);
  const raffle = extractKeywordContexts(combinedText, KEYWORDS.raffle);
  const shipping = extractKeywordContexts(combinedText, KEYWORDS.shipping);
  const security = extractKeywordContexts(combinedText, KEYWORDS.security);
  const subscription = extractKeywordContexts(combinedText, KEYWORDS.subscription);
  const retail = extractKeywordContexts(combinedText, KEYWORDS.retail);
  const unsubscribe = extractKeywordContexts(combinedText, KEYWORDS.unsubscribe);
  const urgent = extractKeywordContexts(combinedText, KEYWORDS.urgent);

  const likelyTransactional =
    paymentReceipt.length > 0 ||
    shipping.length > 0 ||
    failedPayment.length > 0 ||
    security.length > 0 ||
    containsAny(lower, ["thank you for your order", "receipt", "invoice", "tracking number"]).length > 0;

  const likelyMarketing =
    retail.length > 0 ||
    raffle.length > 0 ||
    unsubscribeLinkCount > 0 ||
    labelSignals.includes("CATEGORY_PROMOTIONS");

  const likelySubscription =
    subscription.length > 0 ||
    freeTrial.length > 0 ||
    renewal.length > 0 ||
    containsAny(lower, ["cancel anytime", "monthly", "annual", "membership", "plan"]).length > 0;

  return {
    freeTrial,
    renewal,
    paymentReceipt,
    priceIncrease,
    failedPayment,
    raffle,
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
