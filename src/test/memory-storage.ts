import type { KeyedStorage } from "@/lib/precog/local-data";

/** An in-memory Web Storage for tests; `data` exposes what was written. */
export function memoryStorage(
  seed: Record<string, string> = {},
): KeyedStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    data,
  };
}
