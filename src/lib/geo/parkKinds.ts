// What a park's things on OpenStreetMap are as the app's own: fields, courts and play areas (from
// leisure=pitch and its sport, playgrounds, pools, dog parks, tracks, skate parks, gardens, splash
// pads), amenities (grills, fitness stations, flagpoles, street lamps, utility poles, bike racks,
// fountains, gates) and lines (power lines, hedges). One place for the tags, read by the import.
import { FIELD_KINDS, FT_PER_M, LINE_KINDS, clamp } from "../../constants";
import type { AmenityKind, FieldKind, LineKind, P } from "../../types";
import { COURT_FIELDS, courtCount, homeCorner, isBallField } from "../fields";

type Tags = Record<string, string>;

/** A field from OpenStreetMap: what it is, whether players start out of it, a ball field's home
 * plate (the outline's corner index) and how many courts the outline holds. */
export type OsmField = { field: FieldKind; outOfPlay?: boolean; home?: number; courts?: number };

/** A pitch's sport (the first of several, "soccer;football") as a field. */
const SPORTS: Record<string, FieldKind> = {
  baseball: "baseball", softball: "softball", soccer: "soccer", american_football: "football", canadian_football: "football",
  football: "football", gaelic_games: "soccer", australian_football: "soccer",
  tennis: "tennis", padel: "tennis", pickleball: "pickleball", paddle_tennis: "pickleball", platform_tennis: "pickleball",
  basketball: "basketball", netball: "basketball", volleyball: "volleyball", beachvolleyball: "volleyball",
  skateboard: "skate", roller_skating: "skate", running: "track", athletics: "track",
  // (fields with nothing of the app's own to draw: a plain sports field)
  multi: "multi", rugby_union: "multi", rugby_league: "multi", rugby: "multi", lacrosse: "multi", field_hockey: "multi",
  cricket: "multi", ultimate: "multi", frisbee: "multi", hockey: "multi"
};
/** Sports on a pitch that isn't a field to draw (a golf range, a shooting range, a horse ring). */
const NOT_A_FIELD = new Set(["golf", "shooting", "archery", "equestrian", "motocross", "motor", "karting", "horse_racing", "disc_golf", "boules", "bocce", "horseshoes", "shuffleboard", "chess", "table_tennis"]);

/** Whether it's somewhere the public doesn't go (a back yard's pool), or indoors. */
const privateOrIndoor = (tags: Tags) =>
  tags.access === "private" || tags.access === "no" || tags.indoor === "yes" || tags.location === "indoor" || tags.location === "roof" || tags.covered === "yes" || !!tags.building;

/** What kind of field a closed way's tags make it, or null when it isn't one of the app's fields:
 * a part of a ball field mapped by itself (its infield), a private or indoor pool, a garden in a
 * back yard, a track for horses or cars. (For sorting the map's features before there's an outline.) */
export const fieldKindOfTags = (tags: Tags): FieldKind | null => {
  const l = tags.leisure;
  const sport = (tags.sport ?? "").split(";")[0].trim();
  let field: FieldKind | null = null;
  if (l === "pitch") {
    // (a ball field's infield or outfield mapped inside the whole field: the field is mapped too)
    const part = tags.pitch ?? tags.baseball ?? tags.softball;
    if (part === "infield" || part === "outfield" || part === "diamond" || NOT_A_FIELD.has(sport)) return null;
    field = SPORTS[sport] ?? "multi";
  } else if (l === "playground") field = tags.playground === "splash_pad" ? "splash" : "playground";
  else if (l === "swimming_pool" || tags.amenity === "swimming_pool") {
    if (privateOrIndoor(tags)) return null;
    field = "pool";
  } else if (l === "splash_pad" || (tags.amenity === "fountain" && tags.fountain === "splash_pad") || (l === "water_park" && (tags.water_park === "splash_pad" || /splash|spray/i.test(tags.name ?? "")))) field = "splash";
  else if (l === "water_park") {
    if (privateOrIndoor(tags)) return null;
    field = "pool";
  } else if (l === "dog_park") field = "dog";
  else if (l === "track") {
    // (a running track, unless it's for something else)
    if (sport && sport !== "running" && sport !== "athletics" && sport !== "multi") return null;
    field = "track";
  } else if (l === "skatepark") field = "skate";
  else if (l === "garden") {
    if (tags.access === "private" || tags["garden:type"] === "residential") return null;
    field = "garden";
  }
  return field;
};

/** A field mapped on OpenStreetMap, from its tags and its outline (plan points): its kind, out of
 * play as that kind starts, a ball field's home plate and a court area's courts. Null when the tags
 * aren't one of the app's fields (fieldKindOfTags) or the outline is no area. */
export const fieldOf = (tags: Tags, outline: P[]): OsmField | null => {
  const field = outline.length >= 3 ? fieldKindOfTags(tags) : null;
  if (!field) return null;
  return {
    field,
    ...(FIELD_KINDS[field].outOfPlay ? { outOfPlay: true } : {}),
    ...(isBallField(field) ? { home: homeCorner(outline) } : {}),
    ...(COURT_FIELDS.includes(field) ? { courts: courtCount(field, outline) } : {})
  };
};

/** One of the app's newer amenities from a spot's tags (grills, fitness stations, flagpoles,
 * street lamps, utility poles, bike racks, fountains, gates), or null. The older ones (benches,
 * tables, toilets, drinking water, trash cans, parking signs) are osm.ts's osmAmenity. */
export const amenityOf = (tags: Tags): AmenityKind | null => {
  if (tags.amenity === "bbq" || (tags.leisure === "firepit" && tags.bbq === "yes")) return "grill";
  if (tags.leisure === "fitness_station") return "fitness";
  if (tags.man_made === "flagpole") return "flagpole";
  if (tags.highway === "street_lamp" || tags.man_made === "street_lamp") return "light";
  if (tags.power === "pole" || tags.man_made === "utility_pole") return "pole";
  if (tags.amenity === "bicycle_parking") return "bikerack";
  // (a drinking fountain is drinking water; a splash pad is a field)
  if (tags.amenity === "fountain") return tags.fountain === "drinking" || tags.fountain === "bubbler" || tags.drinking_water === "yes" ? "water" : tags.fountain === "splash_pad" ? null : "fountain";
  if (tags.barrier === "gate" || tags.barrier === "lift_gate" || tags.barrier === "swing_gate" || tags.barrier === "kissing_gate") return "gate";
  return null;
};

/** A length in a tag ("12", "12 m", "40'", "40 ft") as feet, or undefined. */
const feet = (v: string | undefined) => {
  if (!v) return undefined;
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return /ft|'|feet/i.test(v) ? n : n * FT_PER_M;
};

/** A power line or a hedge from a way's tags, with its height (ft: tagged, or a high-voltage line's
 * taller towers) and a hedge's width, where known; null for anything else (an underground cable). */
export const lineOf = (tags: Tags): { kind: LineKind; height?: number; width?: number } | null => {
  let kind: LineKind | null = null;
  let height = feet(tags.height);
  if (tags.power === "line" || tags.power === "minor_line") {
    kind = "power";
    // (a transmission line, unmeasured: its wires higher up than a street's, more again for the highest voltages)
    const volts = Math.max(0, ...(tags.voltage ?? "").split(";").map(v => parseFloat(v)).filter(Number.isFinite));
    if (height === undefined && tags.power === "line") height = volts >= 115000 ? 80 : 50;
  } else if (tags.barrier === "hedge") kind = "hedge";
  if (!kind) return null;
  const meta = LINE_KINDS[kind];
  const width = kind === "hedge" ? feet(tags.width) : undefined;
  return {
    kind,
    ...(height !== undefined && meta.heights ? { height: Math.round(clamp(height, meta.heights[0], meta.heights[1]) * 2) / 2 } : {}),
    ...(width !== undefined ? { width: Math.round(clamp(width, 1, meta.maxWidth) * 2) / 2 } : {})
  };
};
