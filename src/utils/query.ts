import type { ParsedQs } from "qs";

/** Express 5 types params as string | string[]. Safely extract a single string value. */
export function paramStr(val: string | string[]): string {
  return typeof val === "string" ? val : (val[0] ?? "");
}

/** Parse a route param as an integer. */
export function paramInt(val: string | string[]): number {
  return parseInt(paramStr(val), 10);
}

/**
 * Extracts only string values from Express's ParsedQs query object.
 * Filters out arrays, nested objects, and undefined values.
 */
export function flattenQuery(query: ParsedQs): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (value === undefined || value === null) {
      result[key] = undefined;
    }
    // ignore array and nested object values
  }
  return result;
}
