// Picking the course's look (lib/landscapes): the painted map's colors, woods and grass, and its
// natural colors in 3D. StylePicker is the Design step's; LandscapePicker the 3D view's compact one.
import { LANDSCAPES, LANDSCAPE_ORDER, type LandscapeId } from "../lib/landscapes";
import { useCourse } from "../state/course";
import { setStyle } from "./DesignPanel";

/** Picking a landscape: its colors (the painted map's, the 3D view's grass and trees). A look:
 * never how many trees there are, never the layout. The Design step's also paints the map in it. */
const pickLandscape = (id: LandscapeId) => setStyle({ theme: "forest", landscape: id, ...LANDSCAPES[id].colors });
const pickColors = (id: LandscapeId) => setStyle({ landscape: id, ...LANDSCAPES[id].colors });

/** The Design step's styles: one painted map, in each landscape's colors and woods. */
export function StylePicker() {
  const s = useCourse(c => c.doc.style);
  const current = (s.landscape ?? "woods") as LandscapeId;
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Style" data-testid="styles">
      {LANDSCAPE_ORDER.map(id => {
        const l = LANDSCAPES[id];
        const c = l.colors;
        const crowns = l.mix ?? [c.trees];
        return (
          <button
            key={id}
            role="radio"
            aria-checked={current === id}
            data-testid={`style-${id}`}
            onClick={() => pickLandscape(id)}
            className={`text-left rounded-lg border p-2 transition-colors ${current === id ? "border-orange-400 bg-orange-500/10" : "border-zinc-700 hover:border-zinc-500"}`}
          >
            <span className="block h-12 rounded-md mb-1.5 relative overflow-hidden" style={{ background: c.rough }}>
              {/* Woods round a fairway, a pond: the painted map in miniature */}
              {[[8, 18, 15], [24, 6, 13], [40, 22, 12], [70, 8, 15], [88, 26, 14], [58, 30, 9], [14, 44, 12], [80, 46, 13]].slice(0, Math.max(3, Math.round(8 * l.treeCover))).map(([x, y, r], i) => (
                <span key={i} className="absolute rounded-full" style={{ left: `${x}%`, top: `${y}%`, width: r * 1.6, height: r * 1.6, background: crowns[i % crowns.length], boxShadow: "inset -2px -3px 0 rgba(0,0,0,0.25)" }} />
              ))}
              <span className="absolute left-[10%] right-[18%] top-[52%] h-3 rounded-full" style={{ background: c.fairway }} />
              <span className="absolute left-[11%] top-[50%] w-2 h-3.5 rounded-sm" style={{ background: "#2563eb" }} />
              <span className="absolute right-[19%] top-[52%] w-3 h-3 rounded-full border border-zinc-900" style={{ background: "#fff" }} />
              <span className="absolute right-[4%] bottom-[6%] w-8 h-4 rounded-full" style={{ background: c.water }} />
            </span>
            <span className="block text-xs font-bold text-zinc-100">{l.label}</span>
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
