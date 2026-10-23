// Trees and ground measured from the air for a site: the newest USGS LiDAR survey over it, read
// straight from AWS (its tiles allow any website), decoded here (laz-perf), a tile at a time with
// pauses so the page keeps moving.
import type { LidarTree } from "../../types";
import type { GeoRef } from "../geoRef";
import { depthFor, emptyPoints, findTrees, measureSite, readTile, siteBox, surveyYear, tilesOver, type Box, type Ept, type LazReader } from "../lidar";

export type LidarSite = {
  source: string;
  trees: LidarTree[];
  /** The ground on a fine grid (see measureSite). */
  measured: ReturnType<typeof measureSite>;
};

const getJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

let reader: Promise<LazReader> | null = null;
const lazReader = () =>
  (reader ??= (async () => {
    const [{ createLazPerf }, wasm] = await Promise.all([import("laz-perf"), import("laz-perf/lib/web/laz-perf.wasm?url")]);
    return (await createLazPerf({ locateFile: () => wasm.default })) as unknown as LazReader;
  })());

/** The surveys to read over a site, newest first, each with points all over it. */
async function* surveysOver(ref: GeoRef, box: Box) {
  const index = (await getJson(new URL("lidar-index.json", document.baseURI).href)) as { base: string; surveys: [string, number, number, number, number][] };
  const over = index.surveys.filter(([, w, s, e, n]) => w <= ref.west && e >= ref.east && s <= ref.south && n >= ref.north).sort((a, b) => surveyYear(b[0]) - surveyYear(a[0]));
  const area = (box[2] - box[0]) * (box[3] - box[1]);
  for (const [name] of over.slice(0, 5)) {
    try {
      const base = `${index.base}${name}`;
      const ept = (await getJson(`${base}/ept.json`)) as Ept;
      if (ept.dataType !== "laszip" || (ept.srs?.horizontal && ept.srs.horizontal !== "3857")) continue;
      const tiles = await tilesOver(ept, box, depthFor(ept), key => getJson(`${base}/ept-hierarchy/${key}.json`));
      // (points all over it, the tiles reaching past it: a survey that only grazes it has few)
      if (tiles.reduce((t, x) => t + x.points, 0) >= area * 0.2) yield { name, base, tiles };
    } catch (err) {
      console.warn("LiDAR survey unreadable", name, err);
    }
  }
}

/** The site's trees and ground from the air, or null where no survey covers it. */
export const fetchLidar = async (ref: GeoRef, onProgress: (fraction: number) => void): Promise<LidarSite | null> => {
  const box = siteBox(ref);
  // The newest survey; one that sees hardly a tree (an old, thin one, or bare of leaves) makes way
  // for the next if that sees more
  const few = Math.max(40, (ref.width * ref.height) / 40_000);
  let best: LidarSite | null = null, tried = 0;
  for await (const survey of surveysOver(ref, box)) {
    const got = await readSurvey(survey, ref, box, onProgress).catch(err => { console.warn("LiDAR survey unreadable", survey.name, err); return null; });
    if (got && (!best || got.trees.length > best.trees.length)) best = got;
    if ((best && best.trees.length >= few) || ++tried >= 2) break;
  }
  return best;
};

const readSurvey = async (survey: { name: string; base: string; tiles: { key: string; points: number }[] }, ref: GeoRef, box: Box, onProgress: (fraction: number) => void): Promise<LidarSite> => {
  const lp = await lazReader();
  const pts = emptyPoints();
  const total = survey.tiles.reduce((t, x) => t + x.points, 0);
  let done = 0, next = 0;
  // A few tiles at a time, each read as it comes
  const worker = async () => {
    while (next < survey.tiles.length) {
      const tile = survey.tiles[next++];
      const res = await fetch(`${survey.base}/ept-data/${tile.key}.laz`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      readTile(lp, new Uint8Array(await res.arrayBuffer()), ref, box, pts);
      done += tile.points;
      onProgress(Math.min(0.95, done / total));
      await new Promise(r => setTimeout(r));
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const measured = measureSite(pts, ref.width, ref.height);
  const year = surveyYear(survey.name);
  onProgress(1);
  return { source: `USGS LiDAR${year ? ` ${year}` : ""}`, trees: findTrees(measured), measured };
};
