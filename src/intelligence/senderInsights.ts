import { Category, Classification } from "@prisma/client";

export interface SenderEmailSample {
  receivedAt: Date | null;
  classification: Pick<
    Classification,
    "category" | "urgencyScore" | "opportunityScore" | "confidence"
  > | null;
}

export interface SenderInsights {
  dominantCategory: Category | "UNKNOWN";
  averageUrgency: number;
  averageOpportunity: number;
  averageConfidence: number;
  maxUrgency: number;
  maxOpportunity: number;
  categorizedEmailCount: number;
  lastSeenAt: Date | null;
}

export function buildSenderInsights(emails: SenderEmailSample[]): SenderInsights {
  const categoryCounts = new Map<string, number>();
  let urgencyTotal = 0;
  let opportunityTotal = 0;
  let confidenceTotal = 0;
  let categorizedEmailCount = 0;
  let maxUrgency = 0;
  let maxOpportunity = 0;
  let lastSeenAt: Date | null = null;

  for (const email of emails) {
    if (email.receivedAt && (!lastSeenAt || email.receivedAt > lastSeenAt)) {
      lastSeenAt = email.receivedAt;
    }

    if (!email.classification) {
      continue;
    }

    categorizedEmailCount += 1;
    urgencyTotal += email.classification.urgencyScore;
    opportunityTotal += email.classification.opportunityScore;
    confidenceTotal += email.classification.confidence;
    maxUrgency = Math.max(maxUrgency, email.classification.urgencyScore);
    maxOpportunity = Math.max(maxOpportunity, email.classification.opportunityScore);

    const category = email.classification.category ?? "UNKNOWN";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const dominantCategory =
    (Array.from(categoryCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] as
      | Category
      | "UNKNOWN"
      | undefined) ?? "UNKNOWN";

  return {
    dominantCategory,
    averageUrgency: categorizedEmailCount ? Math.round(urgencyTotal / categorizedEmailCount) : 0,
    averageOpportunity: categorizedEmailCount ? Math.round(opportunityTotal / categorizedEmailCount) : 0,
    averageConfidence: categorizedEmailCount ? Math.round(confidenceTotal / categorizedEmailCount) : 0,
    maxUrgency,
    maxOpportunity,
    categorizedEmailCount,
    lastSeenAt
  };
}
