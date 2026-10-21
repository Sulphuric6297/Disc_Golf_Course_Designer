// Writes public/lidar-index.json: each USGS 3DEP LiDAR survey kept as Entwine Point Tiles on AWS,
// with the box it covers (west, south, east, north), from the survey boundaries Hobu, Inc. keeps.
// Run now and then (node scripts/lidar-index.mjs) to pick up new surveys.
import { writeFileSync } from "fs";

const SOURCE = "https://raw.githubusercontent.com/hobu/usgs-lidar/master/boundaries/resources.geojson";
const BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/";
const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE}: ${res.status}`);
const fc = await res.json();
const r4 = v => Math.round(v * 1e4) / 1e4;
const surveys = [];
for (const f of fc.features) {
  const { name, url } = f.properties;
  if (!url?.startsWith(BASE) || !url.endsWith("/ept.json")) continue;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = c => {
    if (typeof c[0] === "number") { w = Math.min(w, c[0]); s = Math.min(s, c[1]); e = Math.max(e, c[0]); n = Math.max(n, c[1]); }
    else c.forEach(walk);
  };
  walk(f.geometry.coordinates);
  surveys.push([url.slice(BASE.length, -"/ept.json".length), r4(w), r4(s), r4(e), r4(n)]);
}
surveys.sort((a, b) => (a[0] < b[0] ? -1 : 1));
writeFileSync(new URL("../public/lidar-index.json", import.meta.url), JSON.stringify({ base: BASE, surveys }));
console.log(`${surveys.length} surveys`);
