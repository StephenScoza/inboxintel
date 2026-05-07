import { AlertType, Category } from "@prisma/client";
import { config } from "../config";
import { categoryFamily } from "../classifier/taxonomy";

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
    author?: {
      name: string;
    };
    fields: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
    footer: {
      text: string;
    };
    timestamp?: string;
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

function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emojiForAlertType(alertType: AlertType): string {
  switch (alertType) {
    case AlertType.FREE_TRIAL_ENDING:
      return "⏳";
    case AlertType.RENEWAL_SOON:
      return "♻️";
    case AlertType.PRICE_INCREASE:
      return "📈";
    case AlertType.FAILED_PAYMENT:
      return "🚨";
    case AlertType.HIGH_OPPORTUNITY:
      return "🎯";
    case AlertType.RAFFLE_OR_GIVEAWAY:
      return "🎉";
    case AlertType.URGENT_DEADLINE:
      return "⚠️";
    default:
      return "📬";
  }
}

function scoreBar(score: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(score / 20)));
  return `${"█".repeat(filled)}${"░".repeat(5 - filled)} ${score}/100`;
}

function formatDetectedDetails(amount?: string | null, date?: string | null): string {
  const details = [];
  if (amount?.trim()) {
    details.push(`Amount: ${amount.trim()}`);
  }
  if (date?.trim()) {
    details.push(`Date: ${date.trim()}`);
  }

  return details.length > 0 ? details.join("\n") : "No amount or date detected";
}

export function buildDiscordPayload(input: DiscordAlertInput): DiscordWebhookPayload {
  const detailUrl = `${config.webBaseUrl}/emails/${input.emailId}`;
  const family = categoryFamily(input.category);
  const alertLabel = humanizeEnum(input.alertType);
  const categoryLabel = humanizeEnum(input.category);
  const headline = `${emojiForAlertType(input.alertType)} ${alertLabel}`;
  const senderLine = formatField(input.sender);
  const description = [
    `**${categoryLabel}** in **${family}**`,
    `From: ${senderLine}`,
    "",
    formatField(input.reason)
  ].join("\n");

  return {
    embeds: [
      {
        title: headline,
        description,
        color: colorForAlertType(input.alertType),
        author: {
          name: "InboxIntel Alert"
        },
        url: detailUrl,
        fields: [
          {
            name: "Subject",
            value: formatField(input.subject),
            inline: false
          },
          {
            name: "Scores",
            value: `Urgency: ${scoreBar(input.urgencyScore)}\nOpportunity: ${scoreBar(input.opportunityScore)}\nConfidence: ${scoreBar(input.confidence)}`,
            inline: false
          },
          {
            name: "Detected",
            value: formatDetectedDetails(input.detectedAmount, input.detectedDate),
            inline: false
          },
          {
            name: "Routing",
            value: `Category: ${categoryLabel}\nFamily: ${family}`,
            inline: true
          },
          {
            name: "Gmail Account",
            value: formatField(input.gmailAccountEmail),
            inline: true
          },
          {
            name: "Sender",
            value: senderLine,
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
        },
        timestamp: new Date().toISOString()
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
