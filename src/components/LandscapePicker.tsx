// Picking the 3D view's landscape (lib/landscapes; View panel, 3D look): its natural colors, woods
// and grass, in 3D only. The map keeps its own colors (Map style).
import { LANDSCAPES, LANDSCAPE_ORDER, type LandscapeId } from "../lib/landscapes";
import { useCourse } from "../state/course";
import type { MapStyle } from "../types";
import { setStyle } from "./DesignPanel";

/** Picking a landscape: all of its colors in 3D, each color picked there before let go. */
const pick = (id: LandscapeId, current: LandscapeId, s: MapStyle) => {
  if (id === current) return;
  setStyle({ look3d: { ...s.look3d, landscape: id, trees: undefined, treeMix: undefined, fairway: undefined, rough: undefined, path: undefined, water: undefined } });
};

/** A landscape as a little scene: its grass, a fairway, two treetops and water along the bottom. */
function Swatch({ id }: { id: LandscapeId }) {
  const c = LANDSCAPES[id].colors, mix = LANDSCAPES[id].mix;
  return (
    <svg viewBox="0 0 60 40" className="block w-full h-full" aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="60" height="40" fill={c.rough} />
      <path d="M-2 26 C 14 18, 30 30, 62 20 L 62 28 C 34 36, 16 26, -2 33 Z" fill={c.fairway} />
      <path d="M8 40 C 14 31, 22 29, 30 40 Z" fill={c.path} opacity="0.9" />
      <circle cx="13" cy="11" r="9" fill={mix?.[1] ?? c.trees} />
      <circle cx="24" cy="8" r="7" fill={c.trees} />
      <circle cx="47" cy="10" r="10" fill={mix?.[2] ?? c.trees} />
      <rect y="35" x="34" width="26" height="5" fill={c.water} />
    </svg>
  );
}

export function LandscapePicker() {
  const s = useCourse(c => c.doc.style);
  const current = (s.look3d?.landscape ?? s.landscape ?? "woods") as LandscapeId;
  // (the same tiles and ring as the Map style's beside it)
  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-2.5" role="radiogroup" aria-label="Landscape" data-testid="landscapes">
      {LANDSCAPE_ORDER.map(id => {
        const l = LANDSCAPES[id], on = current === id;
        return (
          <button key={id} role="radio" aria-checked={on} data-testid={`landscape-${id}`} title={l.blurb} onClick={() => pick(id, current, s)} className="group text-center rounded-[12px]">
            <span className={`block w-full aspect-[3/2] overflow-hidden rounded-[12px] transition ${on ? "ring-[2.5px] ring-orange-400" : "ring-1 ring-white/15 group-hover:ring-white/35"}`}><Swatch id={id} /></span>
            <span className={`block px-0.5 pt-1 text-[11px] leading-tight ${on ? "text-zinc-50 font-semibold" : "text-zinc-400"}`}>{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
