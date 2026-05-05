import { AlertType, Category } from "@prisma/client";
import { config } from "../config";

interface DiscordAlertInput {
  alertType: AlertType;
  category: Category;
  subject: string | null;
  sender: string | null;
  reason: string;
  urgencyScore: number;
  opportunityScore: number;
  confidence: number;
  detectedAmount?: string | null;
  detectedDate?: string | null;
  gmailAccountEmail: string;
  emailId: string;
}

function webhookForType(alertType: AlertType): string {
  switch (alertType) {
    case AlertType.FREE_TRIAL_ENDING:
      return config.discordTrialsWebhook;
    case AlertType.RENEWAL_SOON:
      return config.discordRenewalsWebhook;
    case AlertType.PRICE_INCREASE:
    case AlertType.FAILED_PAYMENT:
      return config.discordMoneyLeaksWebhook;
    case AlertType.HIGH_OPPORTUNITY:
    case AlertType.RAFFLE_OR_GIVEAWAY:
      return config.discordOpportunitiesWebhook;
    case AlertType.URGENT_DEADLINE:
      return config.discordGeneralAlertsWebhook;
    default:
      return config.discordGeneralAlertsWebhook;
  }
}

export async function sendDiscordAlert(input: DiscordAlertInput) {
  const webhookUrl = webhookForType(input.alertType);
  const detailUrl = `${config.webBaseUrl}/emails/${input.emailId}`;

  const content = [
    `**${input.alertType}**`,
    `Category: ${input.category}`,
    `Subject: ${input.subject ?? "(no subject)"}`,
    `Sender: ${input.sender ?? "unknown"}`,
    `Reason: ${input.reason}`,
    `Urgency Score: ${input.urgencyScore}`,
    `Opportunity Score: ${input.opportunityScore}`,
    `Confidence: ${input.confidence}`,
    `Detected Amount: ${input.detectedAmount ?? "n/a"}`,
    `Detected Date: ${input.detectedDate ?? "n/a"}`,
    `Gmail Account: ${input.gmailAccountEmail}`,
    `Dashboard: ${detailUrl}`
  ].join("\n");

  if (!webhookUrl) {
    return {
      webhookTarget: "not-configured",
      deliveredAt: null,
      payloadJson: { content }
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with status ${response.status}`);
  }

  return {
    webhookTarget: webhookUrl,
    deliveredAt: new Date(),
    payloadJson: { content }
  };
}

