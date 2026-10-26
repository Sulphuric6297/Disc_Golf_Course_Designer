// What the site import downloaded, kept for the session: bringing the same spot in again (or a
// smaller frame inside it, for what's kept as map data) uses it instead of asking again. Only in
// memory: a reload starts afresh.
import { isAbort, untilAborted, type GeoBounds } from "./core";

/** (`hear`: how far along it is goes to whoever asked for it last) */
type Entry = { key: string; bounds?: GeoBounds; value: Promise<unknown>; settled: boolean; hear?: (fraction: number) => void };
const kept = new Map<string, Entry[]>();
/** How many of each kind are kept (a photo is a few MB, a LiDAR survey's ground tens). */
const KEEP: Record<string, number> = { photo: 3, elevation: 4, lidar: 2, osm: 6, buildings: 6, nature: 3 };

/** A box's key, to about 1 cm. */
export const boundsKey = (b: GeoBounds) => [b.north, b.south, b.west, b.east].map(v => v.toFixed(7)).join(",");
const contains = (outer: GeoBounds, inner: GeoBounds) => outer.north >= inner.north && outer.south <= inner.south && outer.west <= inner.west && outer.east >= inner.east;

const list = (kind: string) => {
  let l = kept.get(kind);
  if (!l) kept.set(kind, (l = []));
  return l;
};

const put = <T>(kind: string, key: string, bounds: GeoBounds | undefined, make: (report: (fraction: number) => void) => Promise<T>, hear?: (fraction: number) => void) => {
  const l = list(kind);
  const entry: Entry = { key, bounds, value: Promise.resolve(), settled: false, hear };
  const value = make(f => entry.hear?.(f));
  entry.value = value;
  l.unshift(entry);
  l.splice(KEEP[kind] ?? 3);
  // (a download that failed or was stopped isn't kept)
  value.then(() => { entry.settled = true; }, () => { const i = l.indexOf(entry); if (i >= 0) l.splice(i, 1); });
  return value;
};

/**
 * What `make` gives for this key, from the cache where it's there: the same download in flight is
 * shared. `within`: a box whose kept answer covers any box inside it too (map data, cut to the
 * site later). One whose download was stopped by another import is asked again. `make` reports
 * how far along it is to `report`, which passes it on to the `onProgress` of whoever asked last.
 */
export const cached = <T>(kind: string, key: string, make: (report: (fraction: number) => void) => Promise<T>, opts: { signal?: AbortSignal; within?: GeoBounds; onProgress?: (fraction: number) => void } = {}): { value: Promise<T>; hit: boolean } => {
  const l = list(kind);
  const hit = l.find(e => (opts.within && e.bounds ? e.key === key && contains(e.bounds, opts.within) : e.key === key && !e.bounds));
  if (hit) {
    // (to the front: used last, kept longest)
    l.splice(l.indexOf(hit), 1);
    l.unshift(hit);
    hit.hear = opts.onProgress;
    const value = untilAborted(hit.value as Promise<T>, opts.signal).catch(err => {
      if (isAbort(err) && !opts.signal?.aborted) return put(kind, key, opts.within, make, opts.onProgress);
      throw err;
    });
    return { value, hit: true };
  }
  return { value: put(kind, key, opts.within, make, opts.onProgress), hit: false };
};

/** Puts an answer in the cache by hand (a better one that came in late, say), in place of what's there for the same box. */
export const keep = <T>(kind: string, key: string, value: T, within?: GeoBounds) => {
  const l = list(kind);
  const at = l.findIndex(e => e.key === key && (within && e.bounds ? boundsKey(e.bounds) === boundsKey(within) : !e.bounds));
  if (at >= 0) l.splice(at, 1);
  void put(kind, key, within, () => Promise.resolve(value));
};

/** What's kept for a key (and box), without asking for it: null where nothing is, or it's still coming. */
export const peek = async <T>(kind: string, key: string, within?: GeoBounds): Promise<T | null> => {
  const hit = list(kind).find(e => e.settled && e.key === key && (within && e.bounds ? contains(e.bounds, within) : !e.bounds));
  return hit ? ((await hit.value) as T) : null;
};

/** Forgets everything kept (for tests). */
export const forgetDownloads = () => kept.clear();
