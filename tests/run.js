const assert = require("node:assert/strict");
const { AlertType, Category } = require("@prisma/client");
const { buildEmailIntelligence } = require("../dist/intelligence/buildEmailIntelligence.js");
const {
  cleanSenderName,
  deriveVendorIdentity,
  extractDomainRoot
} = require("../dist/intelligence/vendorIdentity.js");
const { buildSubscriptionInsights } = require("../dist/intelligence/subscriptionInsights.js");
const { buildAlertSuppressionKey } = require("../dist/alerts/policy.js");
const { buildDiscordPayload } = require("../dist/alerts/discord.js");
const {
  buildMailingListInsights,
  extractUnsubscribeTargets
} = require("../dist/intelligence/mailingListInsights.js");
const { extractHeaders } = require("../dist/parser/extractHeaders.js");
const { sanitizeJsonString } = require("../dist/utils/safeJson.js");

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
    name: "classifies recruiting emails as jobs even when trial footer language appears",
    run() {
      const result = evaluateEmail({
        subject: "Netflix is hiring a Full Stack Engineer 4 - Title Launch Management",
        plainTextBody:
          "View this role on LinkedIn. Start your free trial to message recruiters and unlock more job insights.",
        senderDomain: "linkedinmail.com"
      });

      assert.equal(result.classification.category, Category.JOB_OR_CAREER);
      assert.ok(result.classification.confidence >= 85);
    }
  },
  {
    name: "classifies job listings as jobs instead of shipping when role keywords are strong",
    run() {
      const result = evaluateEmail({
        subject: "JavaScript Developer | $55/hr Remote at Crossing Hurdles",
        plainTextBody: "Remote role with salary details. New opportunities arrive daily.",
        senderDomain: "jobs.example.com"
      });

      assert.equal(result.classification.category, Category.JOB_OR_CAREER);
      assert.ok(result.classification.opportunityScore >= 50);
    }
  },
  {
    name: "classifies banking-style messages",
    run() {
      const result = evaluateEmail({
        subject: "Your credit card statement is ready",
        plainTextBody: "Your credit card statement is ready. View your account balance and recent transactions.",
        senderDomain: "chase.com"
      });

      assert.equal(result.classification.category, Category.BANKING);
      assert.ok(result.classification.confidence >= 80);
      assert.equal(result.signals.banking.length > 0, true);
    }
  },
  {
    name: "classifies scheduled withdrawals as banking instead of government",
    run() {
      const result = evaluateEmail({
        subject: "Your scheduled withdrawal is on the way",
        plainTextBody: "Your scheduled withdrawal from your SoFi checking account is on the way.",
        senderDomain: "o.sofi.org"
      });

      assert.equal(result.classification.category, Category.BANKING);
      assert.equal(result.signals.banking.length > 0, true);
      assert.equal(result.signals.government.length, 0);
    }
  },
  {
    name: "does not misclassify normal words as government keyword matches",
    run() {
      const result = evaluateEmail({
        subject: "The NEW hydrating shampoo and glossing conditioner you need",
        plainTextBody: "From the buzzy brand behind all the best hair.",
        senderDomain: "beauty.sephora.com"
      });

      assert.notEqual(result.classification.category, Category.GOVERNMENT);
      assert.equal(result.signals.government.length, 0);
    }
  },
  {
    name: "classifies bill and utility reminders",
    run() {
      const result = evaluateEmail({
        subject: "Your electric bill is ready",
        plainTextBody: "Your utility bill is ready. Payment due on May 12. Autopay is enabled.",
        senderDomain: "utility.example.com"
      });

      assert.equal(result.classification.category, Category.BILL_OR_UTILITY);
      assert.ok(result.classification.urgencyScore >= 50);
      assert.equal(result.signals.bill.length > 0, true);
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
    name: "classifies brand merchandising email as shopping instead of government",
    run() {
      const result = evaluateEmail({
        subject: "Your Cinco de Mayo lineup",
        plainTextBody: "Shop now for your Cinco de Mayo lineup. New arrivals available today.",
        senderDomain: "vitacoco.com",
        labels: ["CATEGORY_PROMOTIONS"],
        links: [
          {
            url: "https://vitacoco.com/unsubscribe",
            domain: "vitacoco.com",
            text: "unsubscribe"
          }
        ]
      });

      assert.equal(result.classification.category, Category.SHOPPING);
      assert.equal(result.signals.government.length, 0);
    }
  },
  {
    name: "classifies LinkedIn-style notifications as social and community",
    run() {
      const result = evaluateEmail({
        subject: "11 people noticed you",
        plainTextBody: "You're getting noticed. Add Hannah Harless and see who reached out.",
        senderDomain: "linkedin.com"
      });

      assert.equal(result.classification.category, Category.SOCIAL_OR_COMMUNITY);
      assert.ok(result.classification.confidence >= 80);
    }
  },
  {
    name: "classifies product update emails as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "Stephen, bring your AI memories and chat history to Gemini",
        plainTextBody: "Get Gemini up to speed on what matters to you with new features and product updates.",
        senderDomain: "google.com"
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
      assert.ok(result.classification.confidence >= 75);
    }
  },
  {
    name: "classifies Google Voice relays as sms or text",
    run() {
      const result = evaluateEmail({
        subject: "New text message from 62297",
        plainTextBody: "Google Voice Macy's: Ends tonight! Order your mom's gift by 11:59pm tonight to make it in time for Mother's Day. Text STOP=End.",
        senderDomain: "google.com"
      });

      assert.equal(result.classification.category, Category.SMS_OR_TEXT);
      assert.ok(result.classification.confidence >= 80);
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
  },
  {
    name: "normalizes alert suppression keys for noisy sender strings",
    run() {
      const a = buildAlertSuppressionKey({
        alertType: AlertType.FAILED_PAYMENT,
        category: Category.FAILED_PAYMENT,
        sender: '"Billing@Example.com"'
      });
      const b = buildAlertSuppressionKey({
        alertType: AlertType.FAILED_PAYMENT,
        category: Category.FAILED_PAYMENT,
        sender: "billing@example.com"
      });

      assert.equal(a, b);
    }
  },
  {
    name: "builds Discord embed payloads instead of plain text blobs",
    run() {
      const payload = buildDiscordPayload({
        alertType: AlertType.RENEWAL_SOON,
        category: Category.SUBSCRIPTION,
        subject: "Adobe Creative Cloud renews soon",
        sender: "billing@adobe.com",
        reason: "Renewal within 2 days",
        urgencyScore: 91,
        opportunityScore: 34,
        confidence: 95,
        detectedAmount: "USD 59.99",
        detectedDate: "2026-05-07T00:00:00.000Z",
        gmailAccountEmail: "stephen.scoza@gmail.com",
        emailId: "email_123"
      });

      assert.equal(Array.isArray(payload.embeds), true);
      assert.equal(payload.embeds.length, 1);
      assert.equal(payload.embeds[0].title, "RENEWAL SOON");
      assert.equal(payload.embeds[0].fields.some((field) => field.name === "Dashboard"), true);
      assert.equal("content" in payload, false);
    }
  },
  {
    name: "classifies paid opinion studies as high-opportunity alerts",
    run() {
      const result = evaluateEmail({
        subject: "ONLINE PAID OPINION STUDY $150- SPOTS STILL AVAILABLE",
        plainTextBody: "Participants needed for an online paid opinion study. Spots still available. Earn $150.",
        senderDomain: "researchpanel.com"
      });

      assert.equal(result.classification.category, Category.UNKNOWN);
      assert.ok(result.classification.opportunityScore >= 85);
      assert.ok(result.classification.alertTypes.includes(AlertType.HIGH_OPPORTUNITY));
      assert.equal(result.signals.opportunity.length > 0, true);
    }
  },
  {
    name: "sanitizes invalid json-style hex escapes from payload strings",
    run() {
      assert.equal(sanitizeJsonString(String.raw`bad \x escape`), String.raw`bad \\x escape`);
    }
  },
  {
    name: "extracts technical headers and routing metadata",
    run() {
      const metadata = extractHeaders({
        historyId: "12345",
        sizeEstimate: 2048,
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "To", value: "user@example.com" },
            { name: "Cc", value: "cc@example.com" },
            { name: "Reply-To", value: "reply@example.com" },
            { name: "Return-Path", value: "<bounce@example.com>" },
            { name: "Delivered-To", value: "user@example.com" },
            { name: "Message-ID", value: "<abc123@example.com>" },
            { name: "List-Unsubscribe", value: "<mailto:unsubscribe@example.com>" },
            { name: "List-Id", value: "Example List" },
            { name: "Auto-Submitted", value: "auto-generated" },
            { name: "Authentication-Results", value: "spf=pass dkim=pass" }
          ],
          parts: [{ mimeType: "text/plain" }, { mimeType: "text/html" }]
        }
      });

      assert.equal(metadata.gmailHistoryId, "12345");
      assert.equal(metadata.gmailSizeEstimate, 2048);
      assert.equal(metadata.payloadMimeType, "multipart/alternative");
      assert.equal(metadata.payloadPartCount, 3);
      assert.equal(metadata.replyTo, "reply@example.com");
      assert.equal(metadata.listUnsubscribe, "<mailto:unsubscribe@example.com>");
      assert.equal(metadata.technicalFactsJson.hasAuthenticationResults, true);
      assert.equal(metadata.technicalFactsJson.hasListHeaders, true);
      assert.equal(metadata.technicalFactsJson.isAutoSubmitted, true);
    }
  },
  {
    name: "groups mailing list traffic and preserves unsubscribe targets",
    run() {
      assert.deepEqual(extractUnsubscribeTargets("<https://example.com/unsub>, <mailto:list@example.com>"), [
        "https://example.com/unsub",
        "mailto:list@example.com"
      ]);

      const insights = buildMailingListInsights([
        {
          id: "1",
          subject: "Weekly deals",
          senderEmail: "shop@example.com",
          senderName: "Example Shop",
          senderDomain: "example.com",
          listId: "deals.example.com",
          listUnsubscribe: "<https://example.com/unsub>, <mailto:deals@example.com>",
          listUnsubscribePost: "List-Unsubscribe=One-Click",
          receivedAt: new Date("2026-05-05T10:00:00Z"),
          classification: {
            category: Category.SHOPPING,
            confidence: 91,
            urgencyScore: 22,
            opportunityScore: 61
          }
        },
        {
          id: "2",
          subject: "Weekend deals",
          senderEmail: "shop@example.com",
          senderName: "Example Shop",
          senderDomain: "example.com",
          listId: "deals.example.com",
          listUnsubscribe: "<https://example.com/unsub>",
          listUnsubscribePost: null,
          receivedAt: new Date("2026-05-06T10:00:00Z"),
          classification: {
            category: Category.SHOPPING,
            confidence: 88,
            urgencyScore: 18,
            opportunityScore: 67
          }
        }
      ]);

      assert.equal(insights.length, 1);
      assert.equal(insights[0].label, "deals.example.com");
      assert.equal(insights[0].emailCount, 2);
      assert.equal(insights[0].oneClickSupported, true);
      assert.equal(insights[0].dominantCategory, Category.SHOPPING);
      assert.deepEqual(insights[0].unsubscribeTargets, [
        "https://example.com/unsub",
        "mailto:deals@example.com"
      ]);
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
