export function sanitizeJsonString(value: string): string {
  return value
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
