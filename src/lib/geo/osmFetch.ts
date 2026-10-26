// OpenStreetMap for a site, as fast as it can be had: every Overpass server and OpenFreeMap's map
// tiles asked at once. Overpass has more (benches, shelters, tees and baskets, sports pitches, path
// surfaces), so it gets a few seconds' head start on the tiles, and longer while the rest of the
// import is still coming; after that the tiles' answer is used. An Overpass answer that comes in
// later is kept for bringing the site in again.
import { cached, keep } from "./cache";
import { abortError, type GeoBounds } from "./core";
import { fetchOsmFeatures, type OsmFeature } from "./osm";
import { fetchTileFeatures } from "./vectorTiles";

/** How long Overpass is waited for once the tiles are in, ms (unless the rest is still coming). */
export const OVERPASS_HEAD_START_MS = 8000;

export type OsmAnswer = { features: OsmFeature[]; from: "overpass" | "tiles" };

const KIND = "osm";
const KEY = "features";

/**
 * What OpenStreetMap has over a box. `settle` resolves once the rest of the import is in (until
 * then, past the head start, Overpass is still waited for); `onBusy` hears when an Overpass server
 * has failed and others are still being asked, `onTiles` when the tiles' answer is in and Overpass
 * is still being waited for. `fresh`: an answer kept from the map tiles isn't used (looking
 * OpenStreetMap up again, for its fuller answer). Throws when neither could be reached.
 */
export const fetchOsm = (bounds: GeoBounds, opts: { signal?: AbortSignal; settle?: Promise<unknown>; headStartMs?: number; onBusy?: () => void; onTiles?: () => void; fresh?: boolean } = {}): { value: Promise<OsmAnswer>; hit: boolean } => {
  const got = cached<OsmAnswer>(KIND, KEY, () => race(bounds, opts), { signal: opts.signal, within: bounds });
  if (!got.hit || !opts.fresh) return got;
  // (looking again: a kept answer from Overpass is as good as a new one; one from the tiles isn't)
  return {
    hit: true,
    value: got.value.then(a => (a.from === "overpass" ? a : race(bounds, opts).then(b => { keep(KIND, KEY, b, bounds); return b; })))
  };
};

const race = (bounds: GeoBounds, opts: { signal?: AbortSignal; settle?: Promise<unknown>; headStartMs?: number; onBusy?: () => void; onTiles?: () => void }) =>
  new Promise<OsmAnswer>((resolve, reject) => {
    let done = false, headStart = false, restIn = !opts.settle;
    let tiles: OsmFeature[] | null = null, tilesOver = false, overpassFailed: unknown = null;
    const finish = (a: OsmAnswer | Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (a instanceof Error) reject(a);
      else resolve(a);
    };
    const decide = () => {
      if (done) return;
      if (tiles && (overpassFailed || (headStart && restIn))) finish({ features: tiles, from: "tiles" });
      else if (overpassFailed && tilesOver) finish(overpassFailed instanceof Error ? overpassFailed : new Error("OpenStreetMap lookup failed."));
    };
    const timer = setTimeout(() => { headStart = true; decide(); }, opts.headStartMs ?? OVERPASS_HEAD_START_MS);
    opts.settle?.then(() => { restIn = true; decide(); }, () => { restIn = true; decide(); });
    opts.signal?.addEventListener("abort", () => finish(abortError()), { once: true });
    fetchOsmFeatures(bounds, undefined, opts.onBusy, opts.signal).then(
      features => {
        if (!done) finish({ features, from: "overpass" });
        // (too late for this import: kept, for bringing it in again)
        else keep(KIND, KEY, { features, from: "overpass" } satisfies OsmAnswer, bounds);
      },
      err => { overpassFailed = err ?? new Error("OpenStreetMap lookup failed."); decide(); }
    );
    fetchTileFeatures(bounds, 20000, opts.signal).then(
      f => { tiles = f; tilesOver = true; if (!done && !overpassFailed) opts.onTiles?.(); decide(); },
      err => { console.warn("OpenFreeMap tiles failed", err); tilesOver = true; decide(); }
    );
  });
