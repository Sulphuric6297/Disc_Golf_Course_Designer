// Picking the course's landscape (lib/landscapes) in the 3D view: its natural colors, woods and
// grass (the map's colors too; the Design step changes each on its own in the map's parts).
import { LANDSCAPES, LANDSCAPE_ORDER, type LandscapeId } from "../lib/landscapes";
import { useCourse } from "../state/course";
import { setStyle } from "./DesignPanel";

/** Picking a landscape: its colors, and its own leaf mix and pines (any picked are let go). */
const pickColors = (id: LandscapeId) => setStyle({ landscape: id, ...LANDSCAPES[id].colors, treeMix: undefined, conifers: undefined });

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
            className={`rounded-lg border p-1 flex flex-col items-center gap-1 transition-colors ${current === id ? "border-orange-500 bg-orange-500/10" : "border-white/[0.12] hover:border-zinc-500"}`}
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
