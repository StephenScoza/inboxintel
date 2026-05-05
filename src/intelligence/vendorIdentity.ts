const COMMON_MAILBOX_PREFIXES = new Set([
  "mail",
  "email",
  "mailer",
  "m",
  "em",
  "msg",
  "messages",
  "notification",
  "notifications",
  "notify",
  "notices",
  "notice",
  "news",
  "newsletter",
  "hello",
  "support",
  "billing",
  "account",
  "accounts",
  "team",
  "orders",
  "order",
  "info",
  "update",
  "updates"
]);

const COUNTRY_STYLE_SECOND_LEVELS = new Set(["co", "com", "net", "org", "gov", "ac"]);

export interface VendorIdentity {
  vendor: string;
  normalizedVendor: string;
  senderName: string | null;
  domainRoot: string;
}

function titleCaseWord(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeVendorSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toDisplayVendor(value: string): string {
  if (/^[a-z0-9-]+$/.test(value)) {
    return value
      .split(/[-_]/)
      .filter(Boolean)
      .map(titleCaseWord)
      .join(" ");
  }

  return value.trim();
}

export function cleanSenderName(senderName: string | null): string | null {
  if (!senderName) {
    return null;
  }

  const cleaned = senderName
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[\[\]\(\)<>]/g, " ")
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\b(no[- ]?reply|do[- ]?not[- ]?reply|donotreply)\b/gi, "")
    .replace(/[<>]/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

export function extractDomainRoot(senderDomain: string | null): string {
  if (!senderDomain) {
    return "unknown";
  }

  const hostname = senderDomain.toLowerCase().replace(/^www\./, "");
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length === 0) {
    return "unknown";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length >= 3) {
    const tld = labels[labels.length - 1];
    const secondLevel = labels[labels.length - 2];
    if (tld.length === 2 && COUNTRY_STYLE_SECOND_LEVELS.has(secondLevel)) {
      return labels[labels.length - 3];
    }
  }

  const candidate = labels[labels.length - 2];
  if (!COMMON_MAILBOX_PREFIXES.has(candidate)) {
    return candidate;
  }

  for (let index = labels.length - 3; index >= 0; index -= 1) {
    if (!COMMON_MAILBOX_PREFIXES.has(labels[index])) {
      return labels[index];
    }
  }

  return candidate;
}

export function deriveVendorIdentity(
  senderName: string | null,
  senderEmail: string | null,
  senderDomain: string | null
): VendorIdentity {
  const cleanedName = cleanSenderName(senderName);
  const domainRoot = extractDomainRoot(senderDomain ?? (senderEmail?.split("@")[1] ?? null));
  const domainVendor = toDisplayVendor(domainRoot);

  if (cleanedName) {
    const nameSlug = normalizeVendorSlug(cleanedName);
    const domainSlug = normalizeVendorSlug(domainVendor);

    if (nameSlug && (nameSlug === domainSlug || nameSlug.includes(domainSlug) || domainSlug.includes(nameSlug))) {
      return {
        vendor: cleanedName,
        normalizedVendor: nameSlug,
        senderName: cleanedName,
        domainRoot
      };
    }

    if (cleanedName.length >= 3 && !/team|support|billing|account/i.test(cleanedName)) {
      return {
        vendor: cleanedName,
        normalizedVendor: nameSlug,
        senderName: cleanedName,
        domainRoot
      };
    }
  }

  return {
    vendor: domainVendor,
    normalizedVendor: normalizeVendorSlug(domainVendor),
    senderName: cleanedName,
    domainRoot
  };
}
