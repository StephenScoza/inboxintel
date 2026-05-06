export const KEYWORDS = {
  banking: [
    "checking account",
    "savings account",
    "bank account",
    "debit card",
    "credit card statement",
    "transaction alert",
    "account balance",
    "bank statement",
    "statement is ready"
  ],
  bill: [
    "bill is ready",
    "payment due",
    "autopay",
    "utility bill",
    "electric bill",
    "water bill",
    "internet bill",
    "phone bill",
    "service address"
  ],
  travel: [
    "trip",
    "flight",
    "hotel",
    "boarding pass",
    "check-in",
    "itinerary",
    "reservation",
    "car rental",
    "gate change"
  ],
  job: [
    "interview",
    "application",
    "recruiter",
    "hiring",
    "job opportunity",
    "candidate",
    "resume",
    "position"
  ],
  healthcare: [
    "appointment",
    "patient portal",
    "medical",
    "prescription",
    "doctor",
    "lab results",
    "health insurance",
    "copay"
  ],
  government: [
    "dmv",
    "irs",
    "tax notice",
    "benefits",
    "social security",
    "government",
    "state of",
    "city of"
  ],
  education: [
    "tuition",
    "class schedule",
    "student account",
    "course",
    "assignment",
    "campus",
    "financial aid",
    "registrar"
  ],
  freeTrial: [
    "trial ends",
    "free trial",
    "your trial",
    "trial period",
    "trial expires",
    "trial will end",
    "trial ending"
  ],
  renewal: [
    "renews on",
    "renewal date",
    "next billing date",
    "renews",
    "auto-renew",
    "renews automatically",
    "subscription renews",
    "next payment"
  ],
  paymentReceipt: [
    "you were charged",
    "receipt",
    "invoice",
    "payment received",
    "order total",
    "charged to your card",
    "billing receipt"
  ],
  priceIncrease: [
    "price increase",
    "updated pricing",
    "new pricing",
    "price is increasing",
    "price will increase",
    "membership price is changing"
  ],
  failedPayment: [
    "payment failed",
    "billing issue",
    "update payment method",
    "card declined",
    "unable to process payment",
    "problem with your payment",
    "retry payment"
  ],
  raffle: ["raffle", "giveaway", "draw closes", "enter to win", "sweepstakes", "winner announced"],
  opportunity: [
    "paid opinion study",
    "paid study",
    "online paid opinion study",
    "market research",
    "research study",
    "focus group",
    "paid survey",
    "participants needed",
    "spots still available"
  ],
  shipping: [
    "shipped",
    "tracking",
    "delivered",
    "order confirmation",
    "out for delivery",
    "shipment",
    "arriving"
  ],
  security: [
    "security alert",
    "new login",
    "password changed",
    "suspicious activity",
    "verification code",
    "sign-in attempt",
    "two-factor"
  ],
  subscription: [
    "subscription",
    "billing cycle",
    "manage subscription",
    "membership",
    "monthly plan",
    "annual plan",
    "billing period"
  ],
  retail: [
    "sale",
    "limited time",
    "shop now",
    "save today",
    "exclusive offer",
    "new arrivals",
    "flash sale",
    "ends tonight"
  ],
  unsubscribe: ["unsubscribe", "manage preferences", "email preferences"],
  urgent: ["ends today", "expires today", "last chance", "deadline", "final reminder", "ending soon", "act now"]
};

export function containsAny(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase();
  return phrases.filter((phrase) => lower.includes(phrase));
}

export function extractKeywordContexts(text: string, phrases: string[], radius = 60): Array<{ phrase: string; context: string }> {
  const lower = text.toLowerCase();
  const matches: Array<{ phrase: string; context: string }> = [];

  for (const phrase of phrases) {
    const index = lower.indexOf(phrase);
    if (index === -1) {
      continue;
    }

    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + phrase.length + radius);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();
    matches.push({ phrase, context });
  }

  return matches;
}
