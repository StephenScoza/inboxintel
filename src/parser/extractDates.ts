export interface ExtractedDate {
  raw: string;
  iso: string;
}

const patterns = [
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* \d{1,2}(?:, \d{4})?\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g
];

function normalizeDate(raw: string): Date | null {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
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

      results.set(raw, {
        raw,
        iso: parsed.toISOString()
      });
    }
  }

  return Array.from(results.values()).sort((a, b) => a.iso.localeCompare(b.iso));
}

