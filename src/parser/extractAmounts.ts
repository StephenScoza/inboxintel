export interface ExtractedAmount {
  raw: string;
  value: number;
  currency: string;
}

export function extractAmounts(text: string): ExtractedAmount[] {
  const results = new Map<string, ExtractedAmount>();
  const pattern = /(?:USD\s*)?\$ ?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/gi;

  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const numeric = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(numeric)) {
      continue;
    }

    results.set(raw, {
      raw,
      value: numeric,
      currency: "USD"
    });
  }

  return Array.from(results.values());
}

