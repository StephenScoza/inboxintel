import { Category } from "@prisma/client";

export interface MailingListEmailRecord {
  id: string;
  subject: string | null;
  senderEmail: string | null;
  senderName: string | null;
  senderDomain: string | null;
  listId: string | null;
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
  receivedAt: Date | null;
  classification: {
    category: Category;
    confidence: number;
    urgencyScore: number;
    opportunityScore: number;
  } | null;
}

export interface MailingListInsight {
  key: string;
  label: string;
  listId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  dominantCategory: Category;
  emailCount: number;
  latestReceivedAt: Date | null;
  latestSubject: string | null;
  averageConfidence: number;
  averageOpportunity: number;
  oneClickSupported: boolean;
  unsubscribeTargets: string[];
}

interface MutableMailingListInsight extends MailingListInsight {
  categoryCounts: Map<Category, number>;
  confidenceTotal: number;
  opportunityTotal: number;
}

function normalizeListId(listId: string | null): string | null {
  if (!listId) {
    return null;
  }

  return listId.replace(/[<>]/g, "").trim() || null;
}

function buildKey(email: MailingListEmailRecord): string | null {
  const normalizedListId = normalizeListId(email.listId);
  if (normalizedListId) {
    return `list:${normalizedListId.toLowerCase()}`;
  }

  if (email.senderEmail) {
    return `sender:${email.senderEmail.toLowerCase()}`;
  }

  if (email.senderDomain) {
    return `domain:${email.senderDomain.toLowerCase()}`;
  }

  return null;
}

function buildLabel(email: MailingListEmailRecord): string {
  const normalizedListId = normalizeListId(email.listId);
  if (normalizedListId) {
    return normalizedListId.split("<")[0]?.trim() || normalizedListId;
  }

  return email.senderName || email.senderEmail || email.senderDomain || "Unknown mailing list";
}

export function extractUnsubscribeTargets(listUnsubscribe: string | null): string[] {
  if (!listUnsubscribe) {
    return [];
  }

  const angleBracketMatches = Array.from(listUnsubscribe.matchAll(/<([^>]+)>/g)).map((match) => match[1].trim());
  const rawTargets = angleBracketMatches.length > 0
    ? angleBracketMatches
    : listUnsubscribe.split(",").map((part) => part.trim());

  return Array.from(new Set(rawTargets.filter(Boolean)));
}

function dominantCategoryFromCounts(categoryCounts: Map<Category, number>): Category {
  let winner: Category = Category.UNKNOWN;
  let max = -1;

  for (const [category, count] of categoryCounts.entries()) {
    if (count > max) {
      winner = category;
      max = count;
    }
  }

  return winner;
}

export function buildMailingListInsights(emails: MailingListEmailRecord[]): MailingListInsight[] {
  const grouped = new Map<string, MutableMailingListInsight>();

  for (const email of emails) {
    const key = buildKey(email);
    if (!key) {
      continue;
    }

    const current = grouped.get(key) ?? {
      key,
      label: buildLabel(email),
      listId: normalizeListId(email.listId),
      senderEmail: email.senderEmail,
      senderDomain: email.senderDomain,
      dominantCategory: Category.UNKNOWN,
      emailCount: 0,
      latestReceivedAt: null,
      latestSubject: null,
      averageConfidence: 0,
      averageOpportunity: 0,
      oneClickSupported: false,
      unsubscribeTargets: [],
      categoryCounts: new Map<Category, number>(),
      confidenceTotal: 0,
      opportunityTotal: 0
    };

    current.emailCount += 1;
    if (!current.latestReceivedAt || (email.receivedAt && email.receivedAt > current.latestReceivedAt)) {
      current.latestReceivedAt = email.receivedAt;
      current.latestSubject = email.subject;
    }

    current.oneClickSupported = current.oneClickSupported || email.listUnsubscribePost?.includes("One-Click") || false;
    current.senderEmail = current.senderEmail ?? email.senderEmail;
    current.senderDomain = current.senderDomain ?? email.senderDomain;
    current.listId = current.listId ?? normalizeListId(email.listId);

    for (const target of extractUnsubscribeTargets(email.listUnsubscribe)) {
      if (!current.unsubscribeTargets.includes(target)) {
        current.unsubscribeTargets.push(target);
      }
    }

    const category = email.classification?.category ?? Category.UNKNOWN;
    current.categoryCounts.set(category, (current.categoryCounts.get(category) ?? 0) + 1);
    current.confidenceTotal += email.classification?.confidence ?? 0;
    current.opportunityTotal += email.classification?.opportunityScore ?? 0;

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      listId: entry.listId,
      senderEmail: entry.senderEmail,
      senderDomain: entry.senderDomain,
      dominantCategory: dominantCategoryFromCounts(entry.categoryCounts),
      emailCount: entry.emailCount,
      latestReceivedAt: entry.latestReceivedAt,
      latestSubject: entry.latestSubject,
      averageConfidence: Math.round(entry.confidenceTotal / Math.max(entry.emailCount, 1)),
      averageOpportunity: Math.round(entry.opportunityTotal / Math.max(entry.emailCount, 1)),
      oneClickSupported: entry.oneClickSupported,
      unsubscribeTargets: entry.unsubscribeTargets
    }))
    .sort((left, right) => {
      if (right.emailCount !== left.emailCount) {
        return right.emailCount - left.emailCount;
      }

      return (right.latestReceivedAt?.getTime() ?? 0) - (left.latestReceivedAt?.getTime() ?? 0);
    });
}
