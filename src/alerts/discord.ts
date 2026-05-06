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

interface DiscordWebhookPayload {
  content?: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
    footer: {
      text: string;
    };
    url?: string;
  }>;
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

function colorForAlertType(alertType: AlertType): number {
  switch (alertType) {
    case AlertType.FAILED_PAYMENT:
      return 0xef4444;
    case AlertType.PRICE_INCREASE:
      return 0xf97316;
    case AlertType.FREE_TRIAL_ENDING:
      return 0x14b8a6;
    case AlertType.RENEWAL_SOON:
      return 0x3b82f6;
    case AlertType.RAFFLE_OR_GIVEAWAY:
    case AlertType.HIGH_OPPORTUNITY:
      return 0x8b5cf6;
    case AlertType.URGENT_DEADLINE:
      return 0xf59e0b;
    default:
      return 0x64748b;
  }
}

function formatField(value: string | null | undefined, fallback = "n/a"): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

export function buildDiscordPayload(input: DiscordAlertInput): DiscordWebhookPayload {
  const detailUrl = `${config.webBaseUrl}/emails/${input.emailId}`;

  return {
    embeds: [
      {
        title: input.alertType.replace(/_/g, " "),
        description: formatField(input.reason),
        color: colorForAlertType(input.alertType),
        url: detailUrl,
        fields: [
          {
            name: "Category",
            value: formatField(input.category),
            inline: true
          },
          {
            name: "Sender",
            value: formatField(input.sender),
            inline: true
          },
          {
            name: "Gmail Account",
            value: formatField(input.gmailAccountEmail),
            inline: true
          },
          {
            name: "Subject",
            value: formatField(input.subject),
            inline: false
          },
          {
            name: "Urgency",
            value: String(input.urgencyScore),
            inline: true
          },
          {
            name: "Opportunity",
            value: String(input.opportunityScore),
            inline: true
          },
          {
            name: "Confidence",
            value: String(input.confidence),
            inline: true
          },
          {
            name: "Detected Amount",
            value: formatField(input.detectedAmount),
            inline: true
          },
          {
            name: "Detected Date",
            value: formatField(input.detectedDate),
            inline: true
          },
          {
            name: "Dashboard",
            value: `[View email](${detailUrl})`,
            inline: false
          }
        ],
        footer: {
          text: "InboxIntel read-only Gmail monitor"
        }
      }
    ]
  };
}

export async function sendDiscordAlert(input: DiscordAlertInput) {
  const webhookUrl = webhookForType(input.alertType);
  const payload = buildDiscordPayload(input);

  if (!webhookUrl) {
    return {
      webhookTarget: "not-configured",
      deliveredAt: null,
      payloadJson: payload
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with status ${response.status}`);
  }

  return {
    webhookTarget: webhookUrl,
    deliveredAt: new Date(),
    payloadJson: payload
  };
}
