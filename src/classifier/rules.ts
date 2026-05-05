export const KEYWORDS = {
  freeTrial: ["trial ends", "free trial", "your trial", "trial period", "trial expires"],
  renewal: ["renews on", "renewal date", "next billing date", "renews", "auto-renew"],
  paymentReceipt: ["you were charged", "receipt", "invoice", "payment received", "order total"],
  priceIncrease: ["price increase", "updated pricing", "new pricing", "price is increasing"],
  failedPayment: ["payment failed", "billing issue", "update payment method", "card declined", "unable to process payment"],
  raffle: ["raffle", "giveaway", "draw closes", "enter to win", "sweepstakes"],
  shipping: ["shipped", "tracking", "delivered", "order confirmation", "out for delivery"],
  security: ["security alert", "new login", "password changed", "suspicious activity", "verification code"],
  subscription: ["subscription", "billing cycle", "manage subscription", "membership"],
  retail: ["sale", "limited time", "shop now", "save today", "exclusive offer"],
  unsubscribe: ["unsubscribe", "manage preferences", "email preferences"],
  urgent: ["ends today", "expires today", "last chance", "deadline", "final reminder"]
};

export function containsAny(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase();
  return phrases.filter((phrase) => lower.includes(phrase));
}

