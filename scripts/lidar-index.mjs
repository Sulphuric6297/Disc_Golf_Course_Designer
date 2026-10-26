// Writes public/lidar-index.json: each USGS 3DEP LiDAR survey kept as Entwine Point Tiles on AWS,
// with the box it covers (west, south, east, north), from the survey boundaries Hobu, Inc. keeps;
// and, from USGS's own list of its work units (WESM, in the 3DEP Elevation Index), the year it
// was flown and whether the trees were in leaf then (1), bare (0) or no telling (null: flown on
// the turn of the seasons, over both, or not in the list).
// Run now and then (node scripts/lidar-index.mjs) to pick up new surveys.
import { writeFileSync } from "fs";

const SOURCE = "https://raw.githubusercontent.com/hobu/usgs-lidar/master/boundaries/resources.geojson";
const BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/";
const WESM = "https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/24/query";
const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE}: ${res.status}`);
const fc = await res.json();

// The work units, by name (each survey on AWS is one, or a whole project of them)
const units = new Map();
for (let offset = 0; ; offset += 2000) {
  const q = new URLSearchParams({ where: "1=1", outFields: "workunit,project,collect_start,collect_end", returnGeometry: "false", resultOffset: String(offset), resultRecordCount: "2000", f: "json" });
  const page = await (await fetch(`${WESM}?${q}`)).json();
  if (!page.features?.length) break;
  for (const { attributes: a } of page.features) {
    if (!a.collect_start || !a.collect_end) continue;
    for (const key of [a.workunit, a.project]) {
      if (!key) continue;
      const k = key.toLowerCase(), had = units.get(k);
      units.set(k, had ? { start: Math.min(had.start, a.collect_start), end: Math.max(had.end, a.collect_end) } : { start: a.collect_start, end: a.collect_end });
    }
  }
  if (!page.exceededTransferLimit && page.features.length < 2000) break;
}

/** In leaf (mid-May to mid-October), bare (November to mid-April), or null; the same rule as the
 * app's (leafOnAt in src/lib/lidar.ts). */
const leafAt = t => {
  const d = new Date(t), day = d.getUTCMonth() * 31 + d.getUTCDate();
  if (day >= 4 * 31 + 15 && day <= 9 * 31 + 15) return 1;
  if (day >= 10 * 31 || day <= 3 * 31 + 15) return 0;
  return null;
};
/** Over a whole flying season: whether every day of it was in leaf, or bare. */
const leafOver = (start, end) => {
  if (end - start > 200 * 864e5) return null;
  const a = leafAt(start), b = leafAt(end);
  if (a !== b) return null;
  // (bare at both ends but over a summer between them)
  if (a === 0 && new Date(start).getUTCMonth() < 6 && new Date(end).getUTCMonth() >= 6 && new Date(end).getUTCFullYear() === new Date(start).getUTCFullYear()) return null;
  return a;
};

const r4 = v => Math.round(v * 1e4) / 1e4;
const surveys = [];
let dated = 0;
for (const f of fc.features) {
  const { url } = f.properties;
  if (!url?.startsWith(BASE) || !url.endsWith("/ept.json")) continue;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = c => {
    if (typeof c[0] === "number") { w = Math.min(w, c[0]); s = Math.min(s, c[1]); e = Math.max(e, c[0]); n = Math.max(n, c[1]); }
    else c.forEach(walk);
  };
  walk(f.geometry.coordinates);
  const name = url.slice(BASE.length, -"/ept.json".length);
  const k = name.toLowerCase(), unit = units.get(k) ?? units.get(k.replace(/^usgs_lpc_/, "")) ?? units.get(k.replace(/_las_\d{4}$/, "").replace(/^usgs_lpc_/, ""));
  const row = [name, r4(w), r4(s), r4(e), r4(n)];
  if (unit) {
    dated++;
    row.push(new Date(unit.end).getUTCFullYear(), leafOver(unit.start, unit.end));
  }
  surveys.push(row);
}
surveys.sort((a, b) => (a[0] < b[0] ? -1 : 1));
writeFileSync(new URL("../public/lidar-index.json", import.meta.url), JSON.stringify({ base: BASE, surveys }));
console.log(`${surveys.length} surveys, ${dated} with when they were flown`);
