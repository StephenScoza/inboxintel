export const KEYWORDS = {
  banking: [
    "checking account",
    "savings account",
    "bank account",
    "debit card",
    "credit card statement",
    "transaction alert",
    "withdrawal",
    "scheduled withdrawal",
    "deposit",
    "direct deposit",
    "transfer completed",
    "available balance",
    "account balance",
    "bank statement",
    "statement is ready",
    "transfer your money",
    "instant transfer",
    "real-time movement",
    "credit score",
    "score went down"
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
    "internal revenue service",
    "department of motor vehicles",
    "social security administration",
    "medicare",
    "medicaid",
    "unemployment benefits",
    "benefit determination",
    "state tax",
    "tax refund"
  ],
  education: [
    "tuition",
    "class schedule",
    "student account",
    "course",
    "assignment",
    "campus",
    "financial aid",
    "registrar",
    "alumni",
    "commencement"
  ],
  social: [
    "invitation",
    "noticed you",
    "viewed your profile",
    "connect with",
    "add friend",
    "added you",
    "add your",
    "commented on your post",
    "liked your post",
    "reaction",
    "friend request",
    "community update",
    "neighbor",
    "nextdoor"
  ],
  newsletter: [
    "weekly roundup",
    "weekly report",
    "trend report",
    "trending titles",
    "top picks for you",
    "weekly schedule",
    "restaurant picks",
    "new restaurants",
    "new music",
    "release notes",
    "product update",
    "sheets update",
    "export directly to outlook",
    "video building blocks",
    "what's new",
    "whats new",
    "newsletter",
    "new feature",
    "tips and tricks",
    "browser extension",
    "chat history",
    "daily help",
    "compliance mail",
    "learn more now",
    "book a demo call",
    "gemini",
    "update to our privacy policy",
    "policy update"
  ],
  sms: [
    "new text message",
    "google voice",
    "text stop to opt-out",
    "txt stop=end",
    "reply to this text message",
    "missed a call",
    "voicemail"
  ],
  shopping: [
    "shop",
    "shopping",
    "shop now",
    "new arrivals",
    "lineup",
    "new collection",
    "gift guide",
    "cash back",
    "wallet",
    "boutique",
    "collection"
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
    "payment request",
    "payment to your bank account",
    "requesting payment to your bank account",
    "order total",
    "purchase was charged",
    "charged to your account",
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
    "arriving",
    "pick-up order is ready",
    "pickup order is ready",
    "rapid pick-up order is ready"
  ],
  security: [
    "security alert",
    "new login",
    "password changed",
    "suspicious activity",
    "verification code",
    "sign-in attempt",
    "two-factor",
    "confirm your email address",
    "steam guard",
    "authenticator added",
    "phone number was added",
    "payment scams"
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
    "save today",
    "exclusive offer",
    "flash sale",
    "ends tonight",
    "deals just dropped",
    "today only",
    "last day",
    "% off",
    "just dropped",
    "buy 3, get 1 free",
    "buy 2, get 1 free",
    "opt-out"
  ],
  unsubscribe: ["unsubscribe", "manage preferences", "email preferences"],
  urgent: ["ends today", "expires today", "last chance", "deadline", "final reminder", "ending soon", "act now"]
};

export function containsAny(text: string, phrases: string[]): string[] {
  return phrases.filter((phrase) => phraseMatches(text, phrase));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhraseRegex(phrase: string): RegExp {
  const escaped = escapeRegex(phrase);
  const startsWord = /^[a-z0-9]/i.test(phrase);
  const endsWord = /[a-z0-9]$/i.test(phrase);
  const prefix = startsWord ? "(^|[^a-z0-9])" : "";
  const suffix = endsWord ? "($|[^a-z0-9])" : "";
  return new RegExp(`${prefix}(${escaped})${suffix}`, "ig");
}

function phraseMatches(text: string, phrase: string): boolean {
  return buildPhraseRegex(phrase).test(text);
}

export function extractKeywordContexts(text: string, phrases: string[], radius = 60): Array<{ phrase: string; context: string }> {
  const matches: Array<{ phrase: string; context: string }> = [];

  for (const phrase of phrases) {
    const regex = buildPhraseRegex(phrase);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const phraseIndex = match.index + (match[1] ? match[1].length : 0);
      const start = Math.max(0, phraseIndex - radius);
      const end = Math.min(text.length, phraseIndex + phrase.length + radius);
      const context = text.slice(start, end).replace(/\s+/g, " ").trim();
      matches.push({ phrase, context });

      if (!regex.global) {
        break;
      }
    }
  }

  return matches;
}
