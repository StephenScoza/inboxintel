const assert = require("node:assert/strict");
const { AlertType, Category } = require("@prisma/client");
const { buildEmailIntelligence } = require("../dist/intelligence/buildEmailIntelligence.js");
const {
  cleanSenderName,
  deriveVendorIdentity,
  extractDomainRoot
} = require("../dist/intelligence/vendorIdentity.js");
const { buildSubscriptionInsights } = require("../dist/intelligence/subscriptionInsights.js");

function evaluateEmail(overrides = {}) {
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

const tests = [
  {
    name: "classifies a free-trial ending email with urgency and renewal date context",
    run() {
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
    }
  },
  {
    name: "classifies a failed payment email and preserves money leak alerting",
    run() {
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
    }
  },
  {
    name: "classifies a retail promo when unsubscribe and promo language are present",
    run() {
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
    }
  },
  {
    name: "classifies a giveaway with opportunity and deadline alerting",
    run() {
      const result = evaluateEmail({
        subject: "Enter to win before May 9",
        plainTextBody: "Giveaway ends today. Enter to win a bundle before May 9.",
        senderDomain: "brand.com"
      });

      assert.equal(result.classification.category, Category.RAFFLE_OR_GIVEAWAY);
      assert.ok(result.classification.alertTypes.includes(AlertType.RAFFLE_OR_GIVEAWAY));
      assert.ok(result.classification.alertTypes.includes(AlertType.URGENT_DEADLINE));
      assert.ok(result.classification.opportunityScore >= 80);
    }
  },
  {
    name: "falls back to subscription classification for recurring billing language without explicit keywords",
    run() {
      const result = evaluateEmail({
        subject: "Your monthly plan update",
        plainTextBody: "Your annual plan is active. Cancel anytime. Your membership remains active at $120.00 per year.",
        senderDomain: "figma.com"
      });

      assert.equal(result.classification.category, Category.SUBSCRIPTION);
      assert.equal(result.amounts[0]?.kind, "RECURRING");
      assert.equal(result.signals.likelySubscription, true);
    }
  },
  {
    name: "extracts a useful domain root from nested sender domains",
    run() {
      assert.equal(extractDomainRoot("billing.mail.notion.so"), "notion");
      assert.equal(extractDomainRoot("notifications.service.gov.uk"), "service");
      assert.equal(extractDomainRoot("support.spotify.com"), "spotify");
    }
  },
  {
    name: "derives vendor identity from cleaned sender names and domain roots",
    run() {
      const vendor = deriveVendorIdentity('"Netflix" [no-reply]', "noreply@mail.netflix.com", "mail.netflix.com");
      assert.equal(cleanSenderName('"Netflix" [no-reply]'), "Netflix");
      assert.equal(vendor.vendor, "Netflix");
      assert.equal(vendor.normalizedVendor, "netflix");
      assert.equal(vendor.domainRoot, "netflix");
    }
  },
  {
    name: "scores a price increase subscription as a money leak",
    run() {
      const insights = buildSubscriptionInsights({
        amount: 59.99,
        nextRenewalAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
        status: "ACTIVE",
        confidence: 94,
        sourceCategory: Category.PRICE_INCREASE,
        notes: "price increase detected"
      });

      assert.ok(insights.moneyLeakScore >= 75);
      assert.ok(insights.annualizedCost >= 700);
      assert.ok(insights.reasons.some((reason) => reason.includes("price increase")));
    }
  },
  {
    name: "scores a past due subscription as high risk",
    run() {
      const insights = buildSubscriptionInsights({
        amount: 14.99,
        nextRenewalAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        status: "PAST_DUE",
        confidence: 88,
        sourceCategory: Category.FAILED_PAYMENT,
        notes: null
      });

      assert.ok(insights.riskScore >= 75);
      assert.ok(insights.reasons.some((reason) => reason.includes("Failed payment")));
    }
  }
];

let failures = 0;

for (const entry of tests) {
  try {
    entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log(`Executed ${tests.length} deterministic intelligence checks.`);
