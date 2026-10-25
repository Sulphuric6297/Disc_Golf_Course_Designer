// Top-down or tilted: the 2D and 3D buttons, the same wherever they are (a computer's map, a
// tablet's map buttons, a phone's top bar). A viewer sees only the views they may.
import { useAllowed } from "../auth/perms";
import { useEditor } from "../state/course";
import { FOCUS } from "./ui";

const LOOKS = {
  // (a computer's map: with its other controls; a finger's 44 px on a touch screen)
  map: { box: "pointer-events-auto glass backdrop-blur rounded-lg shadow-lg shadow-black/30 ring-1 ring-white/10 flex p-0.5", btn: "px-2.5 h-8 touch:h-11 touch:px-3.5 touch:text-[13px] rounded-md text-xs", off: "text-zinc-300 hover:text-zinc-50 hover:bg-white/[0.13]" },
  // (a tablet's map buttons: a column)
  rail: { box: "pointer-events-auto flex flex-col glass rounded-2xl border border-white/10 p-0.5", btn: "w-11 h-11 rounded-[12px] text-[13px]", off: "text-zinc-300" },
  // (a phone's top bar)
  bar: { box: "flex bg-white/[0.07] rounded-xl p-0.5 shrink-0", btn: "w-11 h-11 rounded-[10px] text-[14px]", off: "text-zinc-300" }
} as const;

export function ViewToggle({ look }: { look: keyof typeof LOOKS }) {
  const view = useEditor(e => e.view), set = useEditor(e => e.set);
  const may2d = useAllowed("map"), may3d = useAllowed("view3d");
  const views = (["2d", "3d"] as const).filter(v => (v === "3d" ? may3d : may2d));
  if (views.length < 2) return null;
  const l = LOOKS[look];
  return (
    <div className={l.box} role="radiogroup" aria-label="View">
      {views.map(v => (
        <button key={v} role="radio" aria-checked={view === v} onClick={() => set({ view: v })} title={v === "2d" ? "Top-down map (2)" : "Tilted 3D view (3)"} data-testid={`view-${v}`}
          className={`${l.btn} font-bold transition-colors ${FOCUS} ${view === v ? "bg-zinc-100 text-zinc-900" : l.off}`}>
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
