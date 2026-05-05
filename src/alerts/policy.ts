import { Alert, AlertType, Category } from "@prisma/client";

interface AlertFingerprintInput {
  alertType: AlertType;
  category: Category;
  sender: string | null;
}

interface AlertCandidate extends AlertFingerprintInput {
  emailId: string;
  gmailAccountId: string;
  reason: string;
  urgencyScore: number;
  opportunityScore: number;
}

export interface AlertSuppressionDecision {
  suppressed: boolean;
  suppressionKey: string;
  existingAlertId?: string;
}

function normalizeSenderKey(sender: string | null): string {
  return (sender ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/^"?|"?$/g, "")
    .replace(/\s+/g, " ");
}

export function buildAlertSuppressionKey(input: AlertFingerprintInput): string {
  return [input.alertType, input.category, normalizeSenderKey(input.sender)].join("|");
}

function existingAlertSuppressionKey(alert: Alert & { payloadJson: unknown; email?: { senderEmail: string | null; senderRaw: string | null } | null }): string {
  const payload = alert.payloadJson as { suppressionKey?: string; senderKey?: string } | null;
  if (payload?.suppressionKey) {
    return payload.suppressionKey;
  }

  return buildAlertSuppressionKey({
    alertType: alert.type,
    category: alert.category,
    sender: payload?.senderKey ?? alert.email?.senderEmail ?? alert.email?.senderRaw ?? null
  });
}

export async function shouldSuppressAlert(candidate: AlertCandidate): Promise<AlertSuppressionDecision> {
  const [{ prisma }, { config }] = await Promise.all([import("../db"), import("../config")]);
  const suppressionKey = buildAlertSuppressionKey(candidate);
  const cutoff = new Date(Date.now() - config.alertDedupWindowMinutes * 60 * 1000);

  const recentAlerts = await prisma.alert.findMany({
    where: {
      gmailAccountId: candidate.gmailAccountId,
      type: candidate.alertType,
      category: candidate.category,
      createdAt: {
        gte: cutoff
      }
    },
    include: {
      email: {
        select: {
          senderEmail: true,
          senderRaw: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 25
  });

  const match = recentAlerts.find((alert) => existingAlertSuppressionKey(alert) === suppressionKey);

  return match
    ? {
        suppressed: true,
        suppressionKey,
        existingAlertId: match.id
      }
    : {
        suppressed: false,
        suppressionKey
      };
}
