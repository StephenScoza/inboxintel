export interface ExtractedDate {
  raw: string;
  iso: string;
  kind: "RENEWAL" | "TRIAL_END" | "DEADLINE" | "SHIPPING" | "UNKNOWN";
  context: string;
}

const patterns = [
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?(?:, \d{4})?\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g
];

function inferYearIfMissing(raw: string): string {
  if (/\b\d{4}\b/.test(raw) || /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const now = new Date();
  const withCurrentYear = `${raw.replace(/(\d)(st|nd|rd|th)\b/gi, "$1")}, ${now.getFullYear()}`;
  const parsed = new Date(withCurrentYear);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (parsed < thirtyDaysAgo) {
    return `${raw.replace(/(\d)(st|nd|rd|th)\b/gi, "$1")}, ${now.getFullYear() + 1}`;
  }

  return withCurrentYear;
}

function normalizeDate(raw: string): Date | null {
  const parsed = new Date(inferYearIfMissing(raw));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function detectDateKind(context: string): ExtractedDate["kind"] {
  if (/trial|trial ends|trial end|trial expires/.test(context)) {
    return "TRIAL_END";
  }

  if (/renew|renews|renewal|billing date|next payment|next bill/.test(context)) {
    return "RENEWAL";
  }

  if (/tracking|delivery|arriving|shipped|ship by|delivery date/.test(context)) {
    return "SHIPPING";
  }

  if (/deadline|expires|expire|last chance|final reminder|ends/.test(context)) {
    return "DEADLINE";
  }

  return "UNKNOWN";
}

export function extractDates(text: string): ExtractedDate[] {
  const results = new Map<string, ExtractedDate>();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[0];
      const parsed = normalizeDate(raw);
      if (!parsed) {
        continue;
      }

      const start = Math.max(0, (match.index ?? 0) - 60);
      const end = Math.min(text.length, (match.index ?? 0) + raw.length + 60);
      const context = text.slice(start, end).replace(/\s+/g, " ").trim().toLowerCase();

      results.set(raw, {
        raw,
        iso: parsed.toISOString(),
        kind: detectDateKind(context),
        context
      });
    }
  }

  return Array.from(results.values()).sort((a, b) => a.iso.localeCompare(b.iso));
}
