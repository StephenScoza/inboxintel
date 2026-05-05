import { gmail_v1 } from "googleapis";
import { convert } from "html-to-text";

function decodeBase64Url(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function collectParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  bucket: { plain: string[]; html: string[] }
): void {
  if (!part) {
    return;
  }

  const mimeType = part.mimeType ?? "";
  const bodyText = decodeBase64Url(part.body?.data);

  if (mimeType === "text/plain" && bodyText) {
    bucket.plain.push(bodyText);
  }

  if (mimeType === "text/html" && bodyText) {
    bucket.html.push(bodyText);
  }

  if (part.parts?.length) {
    for (const child of part.parts) {
      collectParts(child, bucket);
    }
  }
}

export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined) {
  const bucket = { plain: [] as string[], html: [] as string[] };

  collectParts(payload, bucket);

  if (!bucket.plain.length && payload?.body?.data) {
    bucket.plain.push(decodeBase64Url(payload.body.data));
  }

  const htmlBody = bucket.html.join("\n\n").trim() || null;
  const plainFromHtml = htmlBody
    ? convert(htmlBody, {
        wordwrap: false,
        selectors: [{ selector: "a", options: { ignoreHref: true } }]
      }).trim()
    : "";

  const plainTextBody = bucket.plain.join("\n\n").trim() || plainFromHtml || null;

  return {
    plainTextBody,
    htmlBody
  };
}

