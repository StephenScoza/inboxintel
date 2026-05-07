function normalizeBrokenSurrogates(value: string): string {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] + value[index + 1];
        index += 1;
      } else {
        output += "\uFFFD";
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\uFFFD";
      continue;
    }

    if (code === 0x0000) {
      output += " ";
      continue;
    }

    output += value[index];
  }

  return output;
}

export function sanitizeJsonString(value: string): string {
  return normalizeBrokenSurrogates(value)
    .replace(/\\x/g, "\\\\x")
    .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");
}

export function sanitizeText(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  return sanitizeJsonString(value);
}

export function sanitizeJsonValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeJsonString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry)) as T;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeJsonValue(entry)])
    ) as T;
  }

  return value;
}
