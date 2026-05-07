import { BuiltEmailIntelligence } from "./buildEmailIntelligence";

const MAX_CONTEXT_LENGTH = 180;
const MAX_SIGNAL_MATCHES = 8;
const MAX_HIT_VALUES = 12;
const MAX_AMOUNTS = 10;
const MAX_DATES = 10;
const MAX_LABELS = 12;
const MAX_DOMAINS = 16;

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function dedupeAndLimit(values: string[], limit: number): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function compactMatches(
  matches: Array<{ phrase: string; context: string }>,
  limit = MAX_SIGNAL_MATCHES
): Array<{ phrase: string; context: string | null }> {
  return matches.slice(0, limit).map((match) => ({
    phrase: match.phrase,
    context: truncateText(match.context, MAX_CONTEXT_LENGTH)
  }));
}

export function buildPersistedClassificationSignals(intelligence: BuiltEmailIntelligence) {
  const signals = intelligence.classification.signals as Record<string, unknown>;
  const signalContexts = (signals.signalContexts ?? {}) as Record<string, Array<{ phrase: string; context: string }>>;

  return {
    bankingHits: dedupeAndLimit((signals.bankingHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    billHits: dedupeAndLimit((signals.billHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    travelHits: dedupeAndLimit((signals.travelHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    jobHits: dedupeAndLimit((signals.jobHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    healthcareHits: dedupeAndLimit((signals.healthcareHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    governmentHits: dedupeAndLimit((signals.governmentHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    educationHits: dedupeAndLimit((signals.educationHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    educationEventHits: dedupeAndLimit((signals.educationEventHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    socialHits: dedupeAndLimit((signals.socialHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    newsletterHits: dedupeAndLimit((signals.newsletterHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    smsHits: dedupeAndLimit((signals.smsHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    shoppingHits: dedupeAndLimit((signals.shoppingHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    jobSubjectHits: dedupeAndLimit((signals.jobSubjectHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    freeTrialHits: dedupeAndLimit((signals.freeTrialHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    renewalHits: dedupeAndLimit((signals.renewalHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    receiptHits: dedupeAndLimit((signals.receiptHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    priceIncreaseHits: dedupeAndLimit((signals.priceIncreaseHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    failedPaymentHits: dedupeAndLimit((signals.failedPaymentHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    raffleHits: dedupeAndLimit((signals.raffleHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    opportunityHits: dedupeAndLimit((signals.opportunityHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    shippingHits: dedupeAndLimit((signals.shippingHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    securityHits: dedupeAndLimit((signals.securityHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    subscriptionHits: dedupeAndLimit((signals.subscriptionHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    retailHits: dedupeAndLimit((signals.retailHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    unsubscribeHits: dedupeAndLimit((signals.unsubscribeHits as string[] | undefined) ?? [], MAX_HIT_VALUES),
    hasUnsubscribeLink: Boolean(signals.hasUnsubscribeLink),
    labels: dedupeAndLimit((signals.labels as string[] | undefined) ?? [], MAX_LABELS),
    labelSignals: dedupeAndLimit((signals.labelSignals as string[] | undefined) ?? [], MAX_LABELS),
    likelyTransactional: Boolean(signals.likelyTransactional),
    likelyMarketing: Boolean(signals.likelyMarketing),
    likelySubscription: Boolean(signals.likelySubscription),
    linkDomains: dedupeAndLimit((signals.linkDomains as string[] | undefined) ?? [], MAX_DOMAINS),
    signalContexts: Object.fromEntries(
      Object.entries(signalContexts).map(([key, value]) => [key, compactMatches(value ?? [])])
    ),
    primaryAmount: intelligence.amounts[0]
      ? {
          raw: intelligence.amounts[0].raw,
          value: intelligence.amounts[0].value,
          currency: intelligence.amounts[0].currency,
          kind: intelligence.amounts[0].kind,
          context: truncateText(intelligence.amounts[0].context, MAX_CONTEXT_LENGTH)
        }
      : null,
    primaryDate: intelligence.dates[0]
      ? {
          raw: intelligence.dates[0].raw,
          iso: intelligence.dates[0].iso,
          kind: intelligence.dates[0].kind,
          context: truncateText(intelligence.dates[0].context, MAX_CONTEXT_LENGTH)
        }
      : null
  };
}

export function buildPersistedAmounts(intelligence: BuiltEmailIntelligence) {
  return intelligence.amounts.slice(0, MAX_AMOUNTS).map((amount) => ({
    raw: amount.raw,
    value: amount.value,
    currency: amount.currency,
    kind: amount.kind,
    context: truncateText(amount.context, MAX_CONTEXT_LENGTH)
  }));
}

export function buildPersistedDates(intelligence: BuiltEmailIntelligence) {
  return intelligence.dates.slice(0, MAX_DATES).map((date) => ({
    raw: date.raw,
    iso: date.iso,
    kind: date.kind,
    context: truncateText(date.context, MAX_CONTEXT_LENGTH)
  }));
}
