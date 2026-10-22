// Picking the course's look (lib/landscapes): the painted map's colors, woods and grass, and its
// natural colors in 3D. StylePicker is the Design step's; LandscapePicker the 3D view's compact one.
import { LANDSCAPES, LANDSCAPE_ORDER, type LandscapeId } from "../lib/landscapes";
import { themeOf } from "../lib/mapLook";
import { useCourse } from "../state/course";
import { setStyle } from "./DesignPanel";

/** Picking a landscape: its colors (the painted map's, the 3D view's grass and trees). A look:
 * never how many trees there are, never the layout. The Design step's also paints the map in it. */
const pickLandscape = (id: LandscapeId) => setStyle({ theme: "forest", landscape: id, ...LANDSCAPES[id].colors });
const pickColors = (id: LandscapeId) => setStyle({ landscape: id, ...LANDSCAPES[id].colors });

/** The Design step's landscapes: each a picture of the painted map in it, painted in the map
 * style picked (public/landscapes, made from the app's own paintings). */
export function StylePicker() {
  const s = useCourse(c => c.doc.style);
  const current = (s.landscape ?? "woods") as LandscapeId;
  const look = themeOf(s).id;
  const base = import.meta.env.BASE_URL;
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Landscape" data-testid="styles">
      {LANDSCAPE_ORDER.map(id => {
        const l = LANDSCAPES[id];
        const on = current === id;
        return (
          <button key={id} role="radio" aria-checked={on} data-testid={`style-${id}`} onClick={() => pickLandscape(id)} title={l.blurb}
            className={`text-left rounded-lg overflow-hidden bg-zinc-800 ring-1 transition ${on ? "ring-2 ring-orange-400" : "ring-white/10 hover:ring-white/30"}`}>
            <img src={`${base}landscapes/${look}-${id}.jpg`} alt="" loading="lazy" className="block w-full aspect-[3/2] object-cover" draggable={false} />
            <span className="block px-2 pt-1.5 text-xs font-semibold text-zinc-100">{l.label}</span>
            <span className="block px-2 pb-1.5 text-[10.5px] leading-tight text-zinc-500">{l.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LandscapePicker() {
  const s = useCourse(c => c.doc.style);
  const current = (s.landscape ?? "woods") as LandscapeId;
  const pick = pickColors;
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Landscape" data-testid="landscapes">
      {LANDSCAPE_ORDER.map(id => {
        const l = LANDSCAPES[id];
        return (
          <button
            key={id}
            role="radio"
            aria-checked={current === id}
            data-testid={`landscape-${id}`}
            onClick={() => pick(id)}
            className={`rounded-lg border p-1 flex flex-col items-center gap-1 transition-colors ${current === id ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 hover:border-zinc-500"}`}
          >
            <span className="w-full h-7 rounded relative overflow-hidden" style={{ background: l.colors.rough }}>
              <span className="absolute left-1 right-3 top-2.5 h-2 rounded-full" style={{ background: l.colors.fairway }} />
              <span className="absolute right-1 top-0.5 w-3.5 h-3.5 rounded-full" style={{ background: l.colors.trees }} />
              <span className="absolute left-2 top-0.5 w-3 h-3 rounded-full" style={{ background: l.colors.trees }} />
              <span className="absolute left-0 right-0 bottom-0 h-1.5" style={{ background: l.colors.water }} />
            </span>
            <span className="text-[10px] font-semibold text-zinc-300 leading-tight text-center">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
