import { gmail_v1 } from "googleapis";
import { config } from "../config";

export interface GmailMessagePage {
  historyId?: string;
  pageToken?: string;
  nextPageToken?: string;
  messages: gmail_v1.Schema$Message[];
}

interface FetchOptions {
  maxPages?: number;
  pageOffset?: number;
  pageSize?: number;
  query?: string;
  startPageToken?: string;
}

export class GmailHistoryExpiredError extends Error {
  constructor(startHistoryId: string) {
    super(`Gmail history ${startHistoryId} is no longer available. Falling back to a full sync is required.`);
    this.name = "GmailHistoryExpiredError";
  }
}

function extractGoogleStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    code?: number;
    status?: number;
    response?: { status?: number };
  };

  return candidate.code ?? candidate.status ?? candidate.response?.status;
}

export async function fetchMessageById(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<gmail_v1.Schema$Message | null> {
  const fullResponse = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full"
  });

  return fullResponse.data.id ? fullResponse.data : null;
}

export async function *fetchEmailsInPages(
  gmail: gmail_v1.Gmail,
  options: FetchOptions = {}
): AsyncGenerator<GmailMessagePage> {
  const pageSize = options.pageSize ?? config.gmailPageSize;
  const pageOffset = Math.max(0, options.pageOffset ?? 0);
  let pageToken = options.startPageToken;
  let scannedPageCount = 0;
  let yieldedPageCount = 0;

  do {
    const currentPageToken = pageToken;
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: pageSize,
      pageToken,
      q: options.query,
      includeSpamTrash: false
    });

    if (scannedPageCount >= pageOffset) {
      const messageRefs = listResponse.data.messages ?? [];
      const fullMessages: gmail_v1.Schema$Message[] = [];

      for (const messageRef of messageRefs) {
        if (!messageRef.id) {
          continue;
        }

        const fullMessage = await fetchMessageById(gmail, messageRef.id);
        if (fullMessage) {
          fullMessages.push(fullMessage);
        }
      }

      yield {
        pageToken: currentPageToken,
        nextPageToken: listResponse.data.nextPageToken ?? undefined,
        messages: fullMessages
      };
      yieldedPageCount += 1;
    }

    pageToken = listResponse.data.nextPageToken ?? undefined;
    scannedPageCount += 1;
  } while (pageToken && (!options.maxPages || yieldedPageCount < options.maxPages));
}

export async function *fetchHistoryInPages(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
  options: Omit<FetchOptions, "query"> = {}
): AsyncGenerator<GmailMessagePage> {
  const pageSize = options.pageSize ?? config.gmailPageSize;
  const pageOffset = Math.max(0, options.pageOffset ?? 0);
  let pageToken = options.startPageToken;
  let scannedPageCount = 0;
  let yieldedPageCount = 0;

  do {
    const currentPageToken = pageToken;
    let historyResponse;

    try {
      historyResponse = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        maxResults: pageSize,
        pageToken,
        historyTypes: ["messageAdded"]
      });
    } catch (error) {
      const status = extractGoogleStatus(error);
      const message = error instanceof Error ? error.message : "";

      if (status === 404 || message.includes("Requested entity was not found")) {
        throw new GmailHistoryExpiredError(startHistoryId);
      }

      throw error;
    }

    if (scannedPageCount >= pageOffset) {
      const messageIds = new Set<string>();
      for (const historyRecord of historyResponse.data.history ?? []) {
        for (const added of historyRecord.messagesAdded ?? []) {
          if (added.message?.id) {
            messageIds.add(added.message.id);
          }
        }
      }

      const messages: gmail_v1.Schema$Message[] = [];
      for (const messageId of messageIds) {
        const fullMessage = await fetchMessageById(gmail, messageId);
        if (fullMessage) {
          messages.push(fullMessage);
        }
      }

      yield {
        historyId: historyResponse.data.historyId ?? undefined,
        pageToken: currentPageToken,
        nextPageToken: historyResponse.data.nextPageToken ?? undefined,
        messages
      };
      yieldedPageCount += 1;
    }

    pageToken = historyResponse.data.nextPageToken ?? undefined;
    scannedPageCount += 1;
  } while (pageToken && (!options.maxPages || yieldedPageCount < options.maxPages));
}
