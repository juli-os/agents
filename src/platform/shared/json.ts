// Safe JSON and string utilities (mirrors the common surface of Go internal/infra/util).

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [k: string]: JsonValue };

export type JsonRecord = { readonly [k: string]: JsonValue };

export const safeParse = (raw: string | null | undefined): JsonValue | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return null;
  }
};

export const asRecord = (v: JsonValue | null | undefined): JsonRecord =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRecord) : {};

export const asString = (v: JsonValue | undefined): string => (typeof v === 'string' ? v : '');

/** Truncate to n characters (counterpart of Go util.Truncate); over-long strings end with …. */
export const truncate = (s: string, n: number): string =>
  s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`;
