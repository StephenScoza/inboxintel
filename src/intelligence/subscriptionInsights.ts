import { Category, Subscription, SubscriptionStatus } from "@prisma/client";

export interface SubscriptionInsights {
  riskScore: number;
  moneyLeakScore: number;
  annualizedCost: number | null;
  dueInDays: number | null;
  statusLabel: string;
  reasons: string[];
}

type SubscriptionLike = Pick<
  Subscription,
  "amount" | "nextRenewalAt" | "status" | "confidence" | "sourceCategory" | "notes"
>;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractDueInDays(nextRenewalAt: Date | null): number | null {
  if (!nextRenewalAt) {
    return null;
  }

  const diffMs = nextRenewalAt.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function buildSubscriptionInsights(subscription: SubscriptionLike): SubscriptionInsights {
  const dueInDays = extractDueInDays(subscription.nextRenewalAt);
  const annualizedCost = subscription.amount ? Number(subscription.amount) * 12 : null;
  const reasons: string[] = [];
  let riskScore = 10;
  let moneyLeakScore = 10;

  if (subscription.status === SubscriptionStatus.PAST_DUE) {
    riskScore += 65;
    moneyLeakScore += 30;
    reasons.push("Failed payment or past-due status");
  }

  if (subscription.status === SubscriptionStatus.ENDING_SOON) {
    riskScore += 30;
    reasons.push("Renewal is due within 7 days");
  }

  if (dueInDays !== null && dueInDays < 0) {
    riskScore += 20;
    reasons.push("Renewal date appears to be in the past");
  } else if (dueInDays !== null && dueInDays <= 3) {
    riskScore += 35;
    reasons.push("Renewal is imminent");
  } else if (dueInDays !== null && dueInDays <= 14) {
    riskScore += 15;
    reasons.push("Renewal is approaching");
  }

  if (subscription.sourceCategory === Category.PRICE_INCREASE) {
    moneyLeakScore += 45;
    riskScore += 10;
    reasons.push("Recent price increase signal");
  }

  if (subscription.sourceCategory === Category.FREE_TRIAL) {
    riskScore += 20;
    reasons.push("Free trial may convert soon");
  }

  if (subscription.amount) {
    const amount = Number(subscription.amount);
    if (amount >= 50) {
      moneyLeakScore += 30;
      reasons.push("High monthly amount");
    } else if (amount >= 20) {
      moneyLeakScore += 15;
      reasons.push("Meaningful recurring amount");
    } else {
      moneyLeakScore += 5;
    }
  }

  if (subscription.confidence >= 85) {
    riskScore += 5;
    moneyLeakScore += 5;
  }

  if ((subscription.notes ?? "").includes("price increase")) {
    moneyLeakScore += 10;
  }

  return {
    riskScore: clampScore(riskScore),
    moneyLeakScore: clampScore(moneyLeakScore),
    annualizedCost,
    dueInDays,
    statusLabel: subscription.status,
    reasons
  };
}
