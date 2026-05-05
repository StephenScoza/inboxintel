export interface ExtractedAmount {
  raw: string;
  value: number;
  currency: string;
  kind: "RECURRING" | "CHARGE" | "DISCOUNT" | "UNKNOWN";
  context: string;
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

    const start = Math.max(0, (match.index ?? 0) - 50);
    const end = Math.min(text.length, (match.index ?? 0) + raw.length + 50);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim().toLowerCase();
    const kind =
      /monthly|month|annual|year|yr|renew|subscription|membership|billing cycle/.test(context)
        ? "RECURRING"
        : /charged|charge|invoice|receipt|payment|total|subtotal|billed/.test(context)
          ? "CHARGE"
          : /save|discount|off|coupon|promo/.test(context)
            ? "DISCOUNT"
            : "UNKNOWN";

    results.set(raw, {
      raw,
      value: numeric,
      currency: "USD",
      kind,
      context
    });
  }

  return Array.from(results.values());
}
