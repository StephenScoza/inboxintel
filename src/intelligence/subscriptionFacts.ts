import { Category, SubscriptionStatus } from "@prisma/client";
import { ExtractedAmount } from "../parser/extractAmounts";
import { ExtractedDate } from "../parser/extractDates";
import { ExtractedSignals } from "../parser/extractSignals";

export function chooseSubscriptionAmount(amounts: ExtractedAmount[]): ExtractedAmount | null {
  const ranked = [...amounts].sort((a, b) => {
    const recurringDiff = Number(b.kind === "RECURRING") - Number(a.kind === "RECURRING");
    if (recurringDiff !== 0) {
      return recurringDiff;
    }

    const chargeDiff = Number(b.kind === "CHARGE") - Number(a.kind === "CHARGE");
    if (chargeDiff !== 0) {
      return chargeDiff;
    }

    return b.value - a.value;
  });

  return ranked[0] ?? null;
}

export function chooseImportantDate(dates: ExtractedDate[], category: Category): ExtractedDate | null {
  const preferredKinds =
    category === Category.FREE_TRIAL
      ? ["TRIAL_END", "DEADLINE", "RENEWAL", "UNKNOWN"]
      : category === Category.RENEWAL_NOTICE || category === Category.SUBSCRIPTION
        ? ["RENEWAL", "DEADLINE", "TRIAL_END", "UNKNOWN"]
        : category === Category.ORDER_OR_SHIPPING
          ? ["SHIPPING", "DEADLINE", "UNKNOWN"]
          : ["DEADLINE", "RENEWAL", "TRIAL_END", "UNKNOWN"];

  const ranked = [...dates].sort((a, b) => {
    const kindDiff = preferredKinds.indexOf(a.kind) - preferredKinds.indexOf(b.kind);
    if (kindDiff !== 0) {
      return kindDiff;
    }

    return a.iso.localeCompare(b.iso);
  });

  return ranked[0] ?? null;
}

export function shouldTrackSubscription(category: Category, signals: ExtractedSignals): boolean {
  const trackedCategories: Category[] = [
    Category.SUBSCRIPTION,
    Category.FREE_TRIAL,
    Category.RENEWAL_NOTICE,
    Category.PAYMENT_RECEIPT,
    Category.PRICE_INCREASE,
    Category.FAILED_PAYMENT
  ];

  if (
    trackedCategories.includes(category)
  ) {
    return true;
  }

  return signals.likelySubscription && !signals.likelyMarketing;
}

export function determineSubscriptionStatus(category: Category, primaryDateIso: string | null): SubscriptionStatus {
  if (category === Category.FAILED_PAYMENT) {
    return SubscriptionStatus.PAST_DUE;
  }

  if (!primaryDateIso) {
    return SubscriptionStatus.UNKNOWN;
  }

  const diffMs = new Date(primaryDateIso).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days >= 0 && days <= 7) {
    return SubscriptionStatus.ENDING_SOON;
  }

  if (days > 7) {
    return SubscriptionStatus.ACTIVE;
  }

  return SubscriptionStatus.UNKNOWN;
}
