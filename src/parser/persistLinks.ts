import { createHash } from "crypto";
import { ExtractedLink } from "./extractLinks";

export interface PersistedEmailLink extends ExtractedLink {
  urlHash: string;
}

export function buildEmailLinkHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export function buildPersistedEmailLinks(links: ExtractedLink[]): PersistedEmailLink[] {
  const deduped = new Map<string, PersistedEmailLink>();

  for (const link of links) {
    const urlHash = buildEmailLinkHash(link.url);
    if (!deduped.has(urlHash)) {
      deduped.set(urlHash, {
        ...link,
        urlHash
      });
    }
  }

  return Array.from(deduped.values());
}
