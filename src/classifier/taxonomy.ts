import { Category } from "@prisma/client";

export type CategoryFamily =
  | "PERSONAL"
  | "FINANCE"
  | "COMMERCE"
  | "WORK"
  | "LIFE"
  | "ENGAGEMENT"
  | "SYSTEM";

export const CATEGORY_METADATA: Record<Category, { family: CategoryFamily; description: string; cssClass: string }> = {
  PERSONAL: {
    family: "PERSONAL",
    description: "Direct personal communication from common mailbox providers.",
    cssClass: "category-personal"
  },
  BANKING: {
    family: "FINANCE",
    description: "Banking, withdrawals, deposits, statements, and account activity.",
    cssClass: "category-banking"
  },
  BILL_OR_UTILITY: {
    family: "FINANCE",
    description: "Bills, due dates, utilities, autopay, and service invoices.",
    cssClass: "category-bill-or-utility"
  },
  TRAVEL: {
    family: "LIFE",
    description: "Trips, hotels, flights, reservations, and itinerary-style updates.",
    cssClass: "category-travel"
  },
  JOB_OR_CAREER: {
    family: "WORK",
    description: "Job alerts, recruiting, interviews, applications, and salary-oriented mail.",
    cssClass: "category-job-or-career"
  },
  HEALTHCARE: {
    family: "LIFE",
    description: "Medical, insurance, appointment, and prescription communications.",
    cssClass: "category-healthcare"
  },
  GOVERNMENT: {
    family: "LIFE",
    description: "Official government, benefits, tax, or DMV-style communication.",
    cssClass: "category-government"
  },
  EDUCATION: {
    family: "LIFE",
    description: "School, course, tuition, financial aid, and registrar communication.",
    cssClass: "category-education"
  },
  PAID_RESEARCH_OR_GIG: {
    family: "WORK",
    description: "Paid studies, market research, focus groups, participant recruiting, and gig-like opportunity mail.",
    cssClass: "category-paid-research-or-gig"
  },
  SOCIAL_OR_COMMUNITY: {
    family: "ENGAGEMENT",
    description: "Social networks, community updates, invites, reactions, and relationship-driven notifications.",
    cssClass: "category-social-or-community"
  },
  PRODUCT_OR_NEWSLETTER: {
    family: "SYSTEM",
    description: "Product updates, release notes, newsletters, tips, and vendor communication that is not directly transactional.",
    cssClass: "category-product-or-newsletter"
  },
  SMS_OR_TEXT: {
    family: "SYSTEM",
    description: "SMS relays, Google Voice notifications, and text-style messaging routed through email.",
    cssClass: "category-sms-or-text"
  },
  SHOPPING: {
    family: "COMMERCE",
    description: "General commerce, brand, store, merchandise, and shopping emails.",
    cssClass: "category-shopping"
  },
  RETAIL_PROMO: {
    family: "COMMERCE",
    description: "Aggressive retail promotions, discounts, flash sales, and promo blasts.",
    cssClass: "category-retail-promo"
  },
  SUBSCRIPTION: {
    family: "COMMERCE",
    description: "Recurring plans, memberships, and ongoing paid services.",
    cssClass: "category-subscription"
  },
  FREE_TRIAL: {
    family: "COMMERCE",
    description: "Free trials, trial expiration, and conversion-risk messages.",
    cssClass: "category-free-trial"
  },
  RENEWAL_NOTICE: {
    family: "COMMERCE",
    description: "Upcoming renewals, billing dates, and recurring charge reminders.",
    cssClass: "category-renewal-notice"
  },
  PAYMENT_RECEIPT: {
    family: "FINANCE",
    description: "Receipts, invoices, charges, and payment confirmations.",
    cssClass: "category-payment-receipt"
  },
  PRICE_INCREASE: {
    family: "COMMERCE",
    description: "Pricing changes, cost increases, and money-leak notices.",
    cssClass: "category-price-increase"
  },
  FAILED_PAYMENT: {
    family: "FINANCE",
    description: "Declines, failed charges, billing issues, and payment method problems.",
    cssClass: "category-failed-payment"
  },
  ORDER_OR_SHIPPING: {
    family: "COMMERCE",
    description: "Order confirmations, shipping, delivery, and fulfillment updates.",
    cssClass: "category-order-or-shipping"
  },
  ACCOUNT_SECURITY: {
    family: "SYSTEM",
    description: "Security alerts, login changes, password events, and verification messages.",
    cssClass: "category-account-security"
  },
  RAFFLE_OR_GIVEAWAY: {
    family: "ENGAGEMENT",
    description: "Giveaways, sweepstakes, contests, and enter-to-win opportunities.",
    cssClass: "category-raffle-or-giveaway"
  },
  UNKNOWN: {
    family: "SYSTEM",
    description: "Unresolved emails that need a stronger taxonomy rule or a new category.",
    cssClass: "category-unknown"
  }
};

export function categoryCssClass(category: Category | string | null | undefined): string {
  if (!category || !(category in CATEGORY_METADATA)) {
    return "category-unknown";
  }

  return CATEGORY_METADATA[category as Category].cssClass;
}

export function categoryFamily(category: Category | string | null | undefined): CategoryFamily | "UNKNOWN" {
  if (!category || !(category in CATEGORY_METADATA)) {
    return "UNKNOWN";
  }

  return CATEGORY_METADATA[category as Category].family;
}
