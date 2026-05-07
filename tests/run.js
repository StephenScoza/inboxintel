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
    name: "classifies conference registration mail as education instead of unknown",
    run() {
      const result = evaluateEmail({
        subject: "Have you heard? JADPRO Live registration is open",
        plainTextBody:
          "Registration is now open. Join us for educational sessions, peer learning opportunities, and virtual registration. Register by August 28 for the early bird discount.",
        senderDomain: "hbside.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.EDUCATION);
      assert.notEqual(result.classification.category, Category.UNKNOWN);
    }
  },
  {
    name: "does not classify css position boilerplate as job mail",
    run() {
      const result = evaluateEmail({
        subject: "Clinical Insights on Smarter, More Predictable NiTi Shaping",
        plainTextBody:
          "Join us for a clinical webinar. CSS snippet: position: relative; top: 0.4em; and unsubscribe preferences for customers.",
        senderDomain: "dental.broadcastmed.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.notEqual(result.classification.category, Category.JOB_OR_CAREER);
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
    name: "keeps social-network domains in social even when posts mention items for sale",
    run() {
      const result = evaluateEmail({
        subject: "Top post: I ordered patio furniture from Walmart, and they...",
        plainTextBody: "Top post in your area. A neighbor mentioned items for sale and asked for recommendations.",
        senderDomain: "is.email.nextdoor.com"
      });

      assert.equal(result.classification.category, Category.SOCIAL_OR_COMMUNITY);
    }
  },
  {
    name: "does not misclassify generic marketing copy as social from broad add phrasing",
    run() {
      const result = evaluateEmail({
        subject: "A $100 bonus opportunity is waiting for you, Stephen",
        plainTextBody: "Earn a bonus when you add direct deposit to your account and explore cash back benefits.",
        senderDomain: "capitalone.com"
      });

      assert.equal(result.classification.category, Category.BANKING);
      assert.notEqual(result.classification.category, Category.SOCIAL_OR_COMMUNITY);
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
    name: "classifies streaming watchlists as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "This watchlist will put Spring into your step.",
        plainTextBody: "Explore your watchlist and discover new titles to stream this week.",
        senderDomain: "notifications.pluto.tv",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies tax product surveys as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "A 2-minute survey about TurboTax.",
        plainTextBody: "Tell us how we did in this 2-minute survey about your recent filing experience.",
        senderDomain: "em1.turbotax.intuit.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies canva feature marketing as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "The moment you’ve been waiting for...",
        plainTextBody:
          "Add subtitles to video. Export directly to Outlook. Video building blocks. Canva Sheets update.",
        senderDomain: "engage.canva.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies audible recommendation blasts as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "Explore trending titles",
        plainTextBody:
          "Find top picks for you. Popular listens. You may unsubscribe from Audible promotional emails at any time.",
        senderDomain: "mail.audible.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies b2b compliance-mail promos as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "What is Compliance Mail? Why Do Your Customers Need It?",
        plainTextBody:
          "Many businesses rely on compliance mail every day. Learn more now and book a demo call.",
        senderDomain: "certifiedmaillabels.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
      assert.notEqual(result.classification.category, Category.UNKNOWN);
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
    name: "classifies account confirmation emails as account security",
    run() {
      const result = evaluateEmail({
        subject: "Please confirm your email address",
        plainTextBody: "Confirm your email address to continue using your Wise account.",
        senderDomain: "account.wise.com"
      });

      assert.equal(result.classification.category, Category.ACCOUNT_SECURITY);
      assert.ok(result.classification.urgencyScore >= 75);
    }
  },
  {
    name: "classifies id verification emails as account security",
    run() {
      const result = evaluateEmail({
        subject: "Action needed: ID verification needed",
        plainTextBody: "Complete your ID verification to continue using your account.",
        senderDomain: "go.quick.md"
      });

      assert.equal(result.classification.category, Category.ACCOUNT_SECURITY);
    }
  },
  {
    name: "classifies new device sign-ins as account security",
    run() {
      const result = evaluateEmail({
        subject: "A new device is signed in to your Peacock account",
        plainTextBody: "A new device is signed in to your Peacock account. Review this sign-in activity now.",
        senderDomain: "messaging.peacocktv.com"
      });

      assert.equal(result.classification.category, Category.ACCOUNT_SECURITY);
    }
  },
  {
    name: "classifies banking transfer marketing as banking",
    run() {
      const result = evaluateEmail({
        subject: "Transfer your money at the speed of instant",
        plainTextBody: "No waiting, just real-time movement with instant transfer.",
        senderDomain: "m.sofi.org"
      });

      assert.equal(result.classification.category, Category.BANKING);
      assert.ok(result.classification.confidence >= 80);
    }
  },
  {
    name: "classifies payout request confirmations as payment receipts instead of banking",
    run() {
      const result = evaluateEmail({
        subject: "We’ve got your payment request",
        plainTextBody:
          "Thank you for requesting payment to your bank account. ACH $0.25. We'll let you know once it's been sent.",
        senderDomain: "topcashback.com"
      });

      assert.equal(result.classification.category, Category.PAYMENT_RECEIPT);
      assert.notEqual(result.classification.category, Category.BANKING);
    }
  },
  {
    name: "classifies transaction charge alerts as payment receipts",
    run() {
      const result = evaluateEmail({
        subject: "A new transaction was charged to your account",
        plainTextBody:
          "A purchase was charged to your account in the amount of $24.78. View posted transaction details.",
        senderDomain: "notification.capitalone.com"
      });

      assert.equal(result.classification.category, Category.PAYMENT_RECEIPT);
    }
  },
  {
    name: "classifies credit score monitoring as banking",
    run() {
      const result = evaluateEmail({
        subject: "Looks like your credit score went down",
        plainTextBody: "Let's investigate your credit score and account details.",
        senderDomain: "o.sofi.org"
      });

      assert.equal(result.classification.category, Category.BANKING);
    }
  },
  {
    name: "classifies pickup ready notices as order or shipping",
    run() {
      const result = evaluateEmail({
        subject: "Your Rapid Pick-Up order is READY!",
        plainTextBody: "All the goodness is coming your way. Your rapid pick-up order is ready.",
        senderDomain: "m2.panerabread.com"
      });

      assert.equal(result.classification.category, Category.ORDER_OR_SHIPPING);
    }
  },
  {
    name: "does not classify promo delivery copy as order shipping without order context",
    run() {
      const result = evaluateEmail({
        subject: "Top picks delivered to your inbox",
        plainTextBody: "Deals delivered daily. Save today on flowers and brunch gifts.",
        senderDomain: "grouponmail.com",
        labels: ["CATEGORY_PROMOTIONS"],
        links: [{ url: "https://groupon.example/unsubscribe", domain: "groupon.example", text: "unsubscribe" }]
      });

      assert.notEqual(result.classification.category, Category.ORDER_OR_SHIPPING);
      assert.equal(result.classification.category, Category.RETAIL_PROMO);
    }
  },
  {
    name: "does not classify product review campaigns as order shipping from asset tracking phrases",
    run() {
      const result = evaluateEmail({
        subject: "Unlock your rewards today",
        plainTextBody:
          "Help PM software newbies make good choices. Review asset tracking tools and earn a $10 Amazon gift card for every published review.",
        senderDomain: "review.capterra.com",
        labels: ["CATEGORY_UPDATES"],
        links: [{ url: "https://capterra.example/unsubscribe", domain: "capterra.example", text: "unsubscribe" }]
      });

      assert.notEqual(result.classification.category, Category.ORDER_OR_SHIPPING);
    }
  },
  {
    name: "classifies informed delivery digests as shipping from postal sender context",
    run() {
      const result = evaluateEmail({
        subject: "Your Daily Digest for Wed, 5/6 is ready to view",
        plainTextBody: "USPS Informed Delivery shows tracking updates and arriving mailpieces for your address.",
        senderDomain: "email.informeddelivery.usps.com"
      });

      assert.equal(result.classification.category, Category.ORDER_OR_SHIPPING);
    }
  },
  {
    name: "classifies evisa readiness mail as travel",
    run() {
      const result = evaluateEmail({
        subject: "Important: Your Brazil eVisa Is Ready! Visa Number: 260331-505323",
        plainTextBody: "Your Brazil eVisa is ready. Visa number 260331-505323. Review your travel documents before departure.",
        senderDomain: "vfsevisa.com"
      });

      assert.equal(result.classification.category, Category.TRAVEL);
    }
  },
  {
    name: "classifies promo discount emails as retail promo",
    run() {
      const result = evaluateEmail({
        subject: "last day for 40% off EVERYTHING!",
        plainTextBody: "Today only. Save today with 40% off and more deals just dropped.",
        senderDomain: "e2.bathandbodyworks.com",
        labels: ["CATEGORY_PROMOTIONS"],
        links: [
          { url: "https://brand.example/unsubscribe", domain: "brand.example", text: "unsubscribe" }
        ]
      });

      assert.equal(result.classification.category, Category.RETAIL_PROMO);
    }
  },
  {
    name: "classifies privacy policy updates as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "Update to our privacy policy and more controls",
        plainTextBody: "We've updated our Privacy Policy and added more controls.",
        senderDomain: "email.openai.com"
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "does not classify generic promo emails as product newsletter from footer policy text alone",
    run() {
      const result = evaluateEmail({
        subject: "Running bestsellers",
        plainTextBody: "Explore our bestsellers today. View products, offers, and sizing help.",
        senderDomain: "email.newbalance.com"
      });

      assert.notEqual(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies restaurant discovery newsletters as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "The Edit: this month's restaurant picks",
        plainTextBody: "Discover diner-favorite brunch spots and new restaurants in your area.",
        senderDomain: "mgs.opentable.com"
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "prefers banking over newsletter fallback for transactional finance mail",
    run() {
      const result = evaluateEmail({
        subject: "Your scheduled withdrawal is on the way",
        plainTextBody: "Your scheduled withdrawal from your SoFi checking account is on the way. View account details.",
        senderDomain: "mail.sofi.org"
      });

      assert.equal(result.classification.category, Category.BANKING);
      assert.notEqual(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies commerce-domain marketing fallback as retail promo",
    run() {
      const result = evaluateEmail({
        subject: "Want to Opt-Out of Mother's Day Emails?",
        plainTextBody: "Opt out or unsubscribe from Mother's Day emails if you prefer.",
        senderDomain: "e.snipesusa.com",
        links: [
          { url: "https://snipes.example/unsubscribe", domain: "snipes.example", text: "unsubscribe" }
        ]
      });

      assert.equal(result.classification.category, Category.RETAIL_PROMO);
    }
  },
  {
    name: "prefers retail promo over newsletter footer language for store promotions",
    run() {
      const result = evaluateEmail({
        subject: "lighting the way to savings today only",
        plainTextBody:
          "Check out what's new at Bath & Body Works. Shop our exclusive selection and special promotions today only.",
        senderDomain: "e2.bathandbodyworks.com",
        labels: ["CATEGORY_PROMOTIONS"],
        links: [{ url: "https://bathandbodyworks.example/unsubscribe", domain: "bathandbodyworks.example", text: "unsubscribe" }]
      });

      assert.equal(result.classification.category, Category.RETAIL_PROMO);
      assert.notEqual(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies free bottle consumer promos as shopping",
    run() {
      const result = evaluateEmail({
        subject: "FREE bottle on your next order",
        plainTextBody: "Claim your free bottle on your next order and manage preferences or unsubscribe anytime.",
        senderDomain: "liquid-iv.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.SHOPPING);
    }
  },
  {
    name: "classifies merch pre-launch drops as shopping",
    run() {
      const result = evaluateEmail({
        subject: "Adidas VIRGINIA Vario FLAT EARTHER Exclusive 24 Hour Pre-Launch",
        plainTextBody: "Be one of the first to get a pair of VIRGINIA Vario FLAT EARTHERS.",
        senderDomain: "help.blackyachtrock.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.SHOPPING);
    }
  },
  {
    name: "classifies product launch emails as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "The browser agent platform is here",
        plainTextBody: "The browser agent platform is here. Learn what's new and explore the launch.",
        senderDomain: "hello.browserbase.com",
        labels: ["CATEGORY_UPDATES"]
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies payroll reminders as payment receipts",
    run() {
      const result = evaluateEmail({
        subject: "ePayStub Reminder",
        plainTextBody: "Your ePayStub is ready to view. Sign in to review your pay statement.",
        senderDomain: "epaystub.insperityservices.com"
      });

      assert.equal(result.classification.category, Category.PAYMENT_RECEIPT);
    }
  },
  {
    name: "classifies personal forwards from hotmail as personal",
    run() {
      const result = evaluateEmail({
        subject: "Fw: Move in Reminders",
        plainTextBody: "Forwarded message with move in reminders and apartment notes.",
        senderDomain: "hotmail.com"
      });

      assert.equal(result.classification.category, Category.PERSONAL);
    }
  },
  {
    name: "classifies ticket promos as raffle or giveaway when winning language appears",
    run() {
      const result = evaluateEmail({
        subject: "Download. Enter. Score Match Tickets.",
        plainTextBody: "Download the app, enter now, and score match tickets before the winner is announced.",
        senderDomain: "mg.homedepot.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.equal(result.classification.category, Category.RAFFLE_OR_GIVEAWAY);
    }
  },
  {
    name: "does not classify retail trial-size promos as free trials",
    run() {
      const result = evaluateEmail({
        subject: "Freshly bloomed scents for spring",
        plainTextBody:
          "Shop new arrivals, get a free trial size, and explore Beauty Insider rewards for spring.",
        senderDomain: "beauty.sephora.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.notEqual(result.classification.category, Category.FREE_TRIAL);
      assert.equal(result.classification.category, Category.SHOPPING);
    }
  },
  {
    name: "does not classify social premium prompts as free trials",
    run() {
      const result = evaluateEmail({
        subject: "Stephen J., thanks for being a valued member",
        plainTextBody:
          "See who viewed your profile and start your free trial for Premium to unlock more insights.",
        senderDomain: "em.linkedin.com",
        labels: ["CATEGORY_UPDATES"]
      });

      assert.notEqual(result.classification.category, Category.FREE_TRIAL);
      assert.equal(result.classification.category, Category.SOCIAL_OR_COMMUNITY);
    }
  },
  {
    name: "does not classify scam-awareness promos as account security",
    run() {
      const result = evaluateEmail({
        subject: "Upgrade your savings with a NEW, even higher 4.50%",
        plainTextBody:
          "Learn how to avoid suspicious activity and payment scams while earning more with your savings account.",
        senderDomain: "m.sofi.org",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.notEqual(result.classification.category, Category.ACCOUNT_SECURITY);
      assert.equal(result.classification.category, Category.BANKING);
    }
  },
  {
    name: "does not classify promo rewards mail as payment receipt from receipt wording alone",
    run() {
      const result = evaluateEmail({
        subject: "Stephen, earn a Free Night Reward + 130K Points while you still can",
        plainTextBody:
          "This promotional email says no receipt is necessary and your card could unlock more benefits.",
        senderDomain: "h5.hilton.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.notEqual(result.classification.category, Category.PAYMENT_RECEIPT);
    }
  },
  {
    name: "does not classify retail promos as education from weak course wording",
    run() {
      const result = evaluateEmail({
        subject:
          "Save Up to 70% Off: Capture Your Best Look at JCPenney Portraits by Lifetouch – Includes 1 Digital Image + 9 Standard Prints of One Pose",
        plainTextBody:
          "Portrait studio offer for families. Shop now and save on a photography package.",
        senderDomain: "r.groupon.com",
        labels: ["CATEGORY_PROMOTIONS"]
      });

      assert.notEqual(result.classification.category, Category.EDUCATION);
    }
  },
  {
    name: "classifies identity history requests from government domains",
    run() {
      const result = evaluateEmail({
        subject: "Identity History Summary Request",
        plainTextBody: "Your identity history summary request is being processed.",
        senderDomain: "services.fbi.gov"
      });

      assert.equal(result.classification.category, Category.GOVERNMENT);
    }
  },
  {
    name: "classifies ebay member messages as shopping",
    run() {
      const result = evaluateEmail({
        subject:
          "sturos_40 sent a message about Size 10.5 - Men’s Saucony ProGrid Omni 9 Navy Yellow S70739-24 Brand New In Box #188009708074",
        plainTextBody: "A buyer sent a message about your item listing and asked about the size.",
        senderDomain: "members.ebay.com"
      });

      assert.equal(result.classification.category, Category.SHOPPING);
    }
  },
  {
    name: "classifies OneDrive memory digests as product or newsletter",
    run() {
      const result = evaluateEmail({
        subject: "24 April! Over the years",
        plainTextBody: "Here are some photo memories from OneDrive over the years.",
        senderDomain: "photos.onedrive.com"
      });

      assert.equal(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies cashback affiliate promotions as shopping instead of newsletter",
    run() {
      const result = evaluateEmail({
        subject: "Viator: Up to 15% Cash Back!",
        plainTextBody:
          "Get up to 15% cash back. This increased cash back ends on May 10. Please note this newsletter and the offers included were valid at publication.",
        senderDomain: "topcashback.com",
        labels: ["CATEGORY_PROMOTIONS"],
        links: [{ url: "https://topcashback.example/unsubscribe", domain: "topcashback.example", text: "unsubscribe" }]
      });

      assert.equal(result.classification.category, Category.SHOPPING);
      assert.notEqual(result.classification.category, Category.PRODUCT_OR_NEWSLETTER);
    }
  },
  {
    name: "classifies steam account changes as account security",
    run() {
      const result = evaluateEmail({
        subject: "Steam Guard Mobile Authenticator added",
        plainTextBody: "A Steam Guard Mobile Authenticator was added to your Steam account.",
        senderDomain: "steampowered.com"
      });

      assert.equal(result.classification.category, Category.ACCOUNT_SECURITY);
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

      assert.equal(result.classification.category, Category.PAID_RESEARCH_OR_GIG);
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
