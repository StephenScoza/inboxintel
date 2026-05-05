import { gmail_v1 } from "googleapis";
import { config } from "../config";

export interface GmailMessagePage {
  nextPageToken?: string;
  messages: gmail_v1.Schema$Message[];
}

interface FetchOptions {
  maxPages?: number;
  pageSize?: number;
  query?: string;
}

export async function *fetchEmailsInPages(
  gmail: gmail_v1.Gmail,
  options: FetchOptions = {}
): AsyncGenerator<GmailMessagePage> {
  const pageSize = options.pageSize ?? config.gmailPageSize;
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: pageSize,
      pageToken,
      q: options.query,
      includeSpamTrash: false
    });

    const messageRefs = listResponse.data.messages ?? [];
    const fullMessages: gmail_v1.Schema$Message[] = [];

    for (const messageRef of messageRefs) {
      if (!messageRef.id) {
        continue;
      }

      const fullResponse = await gmail.users.messages.get({
        userId: "me",
        id: messageRef.id,
        format: "full"
      });

      if (fullResponse.data.id) {
        fullMessages.push(fullResponse.data);
      }
    }

    yield {
      nextPageToken: listResponse.data.nextPageToken ?? undefined,
      messages: fullMessages
    };

    pageToken = listResponse.data.nextPageToken ?? undefined;
    pageCount += 1;
  } while (pageToken && (!options.maxPages || pageCount < options.maxPages));
}

