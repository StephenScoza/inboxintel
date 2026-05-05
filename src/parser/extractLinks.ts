import { load } from "cheerio";

export interface ExtractedLink {
  url: string;
  domain: string | null;
  text: string | null;
}

function toDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function extractLinks(plainTextBody: string | null, htmlBody: string | null): ExtractedLink[] {
  const links = new Map<string, ExtractedLink>();

  const textMatches = plainTextBody?.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  for (const url of textMatches) {
    links.set(url, {
      url,
      domain: toDomain(url),
      text: null
    });
  }

  if (htmlBody) {
    const $ = load(htmlBody);
    $("a[href]").each((_, element) => {
      const url = $(element).attr("href");
      if (!url || !/^https?:\/\//i.test(url)) {
        return;
      }

      links.set(url, {
        url,
        domain: toDomain(url),
        text: $(element).text().trim() || null
      });
    });
  }

  return Array.from(links.values());
}

