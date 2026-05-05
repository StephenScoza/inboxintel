import test from "node:test";
import assert from "node:assert/strict";
import { AlertType, Category } from "@prisma/client";
import { buildEmailIntelligence } from "../src/intelligence/buildEmailIntelligence";

function evaluateEmail(overrides: Partial<Parameters<typeof buildEmailIntelligence>[0]> = {}) {
  return buildEmailIntelligence({
    subject: overrides.subject ?? "Default subject",
    snippet: overrides.snippet ?? null,
    plainTextBody: overrides.plainTextBody ?? "",
    htmlBody: overrides.htmlBody ?? null,
    labels: overrides.labels ?? [],
    senderDomain: overrides.senderDomain ?? "example.com",
    links: overrides.links ?? []
  });
}

test("classifies a free-trial ending email with urgency and renewal date context", () => {
  const result = evaluateEmail({
    subject: "Your free trial ends on May 12",
    plainTextBody:
      "Your free trial ends on May 12. Your subscription renews on May 12 for $14.99 per month unless you cancel.",
    senderDomain: "notion.so"
  });

  assert.equal(result.classification.category, Category.FREE_TRIAL);
  assert.ok(result.classification.urgencyScore >= 80);
  assert.ok(result.classification.alertTypes.includes(AlertType.FREE_TRIAL_ENDING));
  assert.equal(result.amounts[0]?.kind, "RECURRING");
  assert.equal(result.dates[0]?.kind, "TRIAL_END");
});

test("classifies a failed payment email and preserves money leak alerting", () => {
  const result = evaluateEmail({
    subject: "Payment failed for your membership",
    plainTextBody:
      "We could not process your payment. Update payment method to avoid interruption. Your monthly charge is $29.00.",
    senderDomain: "spotify.com"
  });

  assert.equal(result.classification.category, Category.FAILED_PAYMENT);
  assert.ok(result.classification.alertTypes.includes(AlertType.FAILED_PAYMENT));
  assert.ok(result.classification.urgencyScore >= 85);
  assert.equal(result.amounts[0]?.kind, "RECURRING");
});

test("classifies a retail promo when unsubscribe and promo language are present", () => {
  const result = evaluateEmail({
    subject: "Flash sale ends tonight",
    plainTextBody: "Shop now and save today on new arrivals.",
    senderDomain: "retailer.com",
    labels: ["CATEGORY_PROMOTIONS"],
    links: [
      {
        url: "https://retailer.com/unsubscribe",
        domain: "retailer.com",
        text: "unsubscribe"
      }
    ]
  });

  assert.equal(result.classification.category, Category.RETAIL_PROMO);
  assert.ok(result.classification.opportunityScore <= 25);
  assert.equal(result.signals.unsubscribeLinkCount, 1);
});

test("classifies a giveaway with opportunity and deadline alerting", () => {
  const result = evaluateEmail({
    subject: "Enter to win before May 9",
    plainTextBody: "Giveaway ends today. Enter to win a bundle before May 9.",
    senderDomain: "brand.com"
  });

  assert.equal(result.classification.category, Category.RAFFLE_OR_GIVEAWAY);
  assert.ok(result.classification.alertTypes.includes(AlertType.RAFFLE_OR_GIVEAWAY));
  assert.ok(result.classification.alertTypes.includes(AlertType.URGENT_DEADLINE));
  assert.ok(result.classification.opportunityScore >= 80);
});

test("falls back to subscription classification for recurring billing language without explicit keywords", () => {
  const result = evaluateEmail({
    subject: "Your monthly plan update",
    plainTextBody: "Your annual plan is active. Cancel anytime. Your membership remains active at $120.00 per year.",
    senderDomain: "figma.com"
  });

  assert.equal(result.classification.category, Category.SUBSCRIPTION);
  assert.equal(result.amounts[0]?.kind, "RECURRING");
  assert.equal(result.signals.likelySubscription, true);
});
