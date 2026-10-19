// Plan feet <-> latitude and longitude, for an imported site. The plan's x runs east from the
// site's west edge, y south from its north edge (sites are at most a mile or so across, so a
// straight scale each way is exact to well under a foot).
import type { CourseDoc, P } from "../types";

export type GeoRef = { north: number; south: number; west: number; east: number; width: number; height: number };

export const geoRefOf = (doc: Pick<CourseDoc, "site" | "canvas">): GeoRef | null =>
  doc.site.bounds ? { ...doc.site.bounds, width: doc.canvas.width, height: doc.canvas.height } : null;

export const toLatLon = (ref: GeoRef, p: P) => ({
  lat: ref.north - (p.y / ref.height) * (ref.north - ref.south),
  lon: ref.west + (p.x / ref.width) * (ref.east - ref.west)
});

export const toPlanXY = (ref: GeoRef, lat: number, lon: number): P => ({
  x: ((lon - ref.west) / (ref.east - ref.west)) * ref.width,
  y: ((ref.north - lat) / (ref.north - ref.south)) * ref.height
});

/** Compass bearing from a to b, degrees clockwise from north. */
export const bearing = (a: P, b: P) => ((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI + 360) % 360;

export const compassPoint = (deg: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
