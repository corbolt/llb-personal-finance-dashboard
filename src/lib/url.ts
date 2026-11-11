export type QueryValue = string | number | null | undefined;

/** Builds `path?key=value…`, leaving out empty values. */
export function href(path: string, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** Reads a single-valued search param (the first one if it repeats). */
export function param(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === undefined || single === "" ? undefined : single;
}
