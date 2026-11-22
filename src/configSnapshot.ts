// Keep function identity; JSON serialization would discard it.
export function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return value.map(snapshot) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(
      ([key, child]) => [key, snapshot(child)],
    )) as T;
  }
  return value;
}

export function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && equal(
      (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key],
    ),
  );
}
