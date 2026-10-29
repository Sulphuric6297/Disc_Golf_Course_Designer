// Reads LiDAR tiles and measures the site off the main thread (see lidarFetch): a tile's compressed
// points in, its points on the site out; or the gathered grids in, the ground, the canopy and the
// trees out. Several of these share a site's tiles.
import { createLazPerf } from "laz-perf/lib/worker/index.js";
import wasm from "laz-perf/lib/worker/laz-perf.wasm?url";
import { findTrees, measureSite, readTile, type Box, type Dem, type Gathered, type LazReader, type Measured } from "../lidar";
import type { GeoRef } from "../geoRef";
import type { P } from "../../types";

export type LidarJob =
  | { id: number; kind: "tile"; buf: ArrayBuffer; ref: GeoRef; box: Box }
  | { id: number; kind: "measure"; g: Gathered; dem: Dem | null; outlines: P[][]; leafOn: boolean | null };

let reader: Promise<LazReader> | null = null;
const post = (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage.bind(self);

/** The buffers of a measured site, to hand back without copying. */
export const measuredBuffers = (m: Measured) => [m.ground.buffer, m.canopy.buffer, m.nUp.buffer, m.nMulti.buffer, m.nGround.buffer, m.surface.buffer, m.roofs.buffer, m.shrub.buffer] as ArrayBuffer[];

self.onmessage = async (e: MessageEvent<LidarJob>) => {
  const job = e.data;
  try {
    if (job.kind === "tile") {
      const lp = await (reader ??= createLazPerf({ locateFile: () => wasm }) as unknown as Promise<LazReader>);
      const p = readTile(lp, new Uint8Array(job.buf), job.ref, job.box);
      post({ id: job.id, points: p }, [p.x.buffer, p.y.buffer, p.z.buffer, p.cls.buffer, p.returns.buffer]);
    } else {
      const m = measureSite(job.g, { dem: job.dem, outlines: job.outlines, leafOn: job.leafOn });
      const trees = findTrees(m);
      // (each buffer once: the counts are the gathered grid's own)
      post({ id: job.id, measured: m, trees }, [...new Set(measuredBuffers(m))]);
    }
  } catch (err) {
    post({ id: job.id, error: String(err) }, []);
  }
};
