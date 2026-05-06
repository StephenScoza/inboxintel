import { gmail_v1 } from "googleapis";
import { sanitizeJsonValue, sanitizeText } from "../utils/safeJson";

export interface EmailTechnicalMetadata {
  toHeader: string | null;
  ccHeader: string | null;
  bccHeader: string | null;
  replyTo: string | null;
  returnPath: string | null;
  deliveredTo: string | null;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  listId: string | null;
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
  precedence: string | null;
  autoSubmitted: string | null;
  authenticationResults: string | null;
  payloadMimeType: string | null;
  payloadPartCount: number;
  gmailHistoryId: string | null;
  gmailSizeEstimate: number | null;
  headersJson: Record<string, string[]>;
  technicalFactsJson: {
    hasListHeaders: boolean;
    hasUnsubscribeHeader: boolean;
    hasAuthenticationResults: boolean;
    recipientCountEstimate: number;
    isAutoSubmitted: boolean;
    precedence: string | null;
    mimeType: string | null;
    partCount: number;
  };
}

function getHeaderValues(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string[] {
  return (headers ?? [])
    .filter((entry) => entry.name?.toLowerCase() === name.toLowerCase() && entry.value)
    .map((entry) => sanitizeText(entry.value) ?? "");
}

function firstHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
  return getHeaderValues(headers, name)[0] ?? null;
}

function countParts(part: gmail_v1.Schema$MessagePart | undefined | null): number {
  if (!part) {
    return 0;
  }

  return 1 + (part.parts ?? []).reduce((sum, child) => sum + countParts(child), 0);
}

function estimateRecipientCount(...headers: Array<string | null>): number {
  return headers
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean).length;
}

export function extractHeaders(message: gmail_v1.Schema$Message): EmailTechnicalMetadata {
  const headers = message.payload?.headers ?? [];
  const headersJson = Object.fromEntries(
    Array.from(new Set(headers.map((entry) => entry.name).filter((value): value is string => Boolean(value))))
      .map((name) => [name, getHeaderValues(headers, name)])
      .filter(([, values]) => values.length > 0)
  );

  const toHeader = firstHeader(headers, "To");
  const ccHeader = firstHeader(headers, "Cc");
  const bccHeader = firstHeader(headers, "Bcc");
  const replyTo = firstHeader(headers, "Reply-To");
  const returnPath = firstHeader(headers, "Return-Path");
  const deliveredTo = firstHeader(headers, "Delivered-To");
  const messageIdHeader = firstHeader(headers, "Message-Id") ?? firstHeader(headers, "Message-ID");
  const inReplyTo = firstHeader(headers, "In-Reply-To");
  const referencesHeader = firstHeader(headers, "References");
  const listId = firstHeader(headers, "List-Id");
  const listUnsubscribe = firstHeader(headers, "List-Unsubscribe");
  const listUnsubscribePost = firstHeader(headers, "List-Unsubscribe-Post");
  const precedence = firstHeader(headers, "Precedence");
  const autoSubmitted = firstHeader(headers, "Auto-Submitted");
  const authenticationResults = firstHeader(headers, "Authentication-Results");
  const payloadMimeType = sanitizeText(message.payload?.mimeType ?? null) ?? null;
  const payloadPartCount = countParts(message.payload);
  const gmailHistoryId = sanitizeText(message.historyId ?? null) ?? null;
  const gmailSizeEstimate = typeof message.sizeEstimate === "number" ? message.sizeEstimate : null;

  const technicalFactsJson = sanitizeJsonValue({
    hasListHeaders: Boolean(listId || listUnsubscribe || listUnsubscribePost),
    hasUnsubscribeHeader: Boolean(listUnsubscribe),
    hasAuthenticationResults: Boolean(authenticationResults),
    recipientCountEstimate: estimateRecipientCount(toHeader, ccHeader, bccHeader),
    isAutoSubmitted: Boolean(autoSubmitted && autoSubmitted.toLowerCase() !== "no"),
    precedence,
    mimeType: payloadMimeType,
    partCount: payloadPartCount
  });

  return {
    toHeader,
    ccHeader,
    bccHeader,
    replyTo,
    returnPath,
    deliveredTo,
    messageIdHeader,
    inReplyTo,
    referencesHeader,
    listId,
    listUnsubscribe,
    listUnsubscribePost,
    precedence,
    autoSubmitted,
    authenticationResults,
    payloadMimeType,
    payloadPartCount,
    gmailHistoryId,
    gmailSizeEstimate,
    headersJson: sanitizeJsonValue(headersJson),
    technicalFactsJson
  };
}
