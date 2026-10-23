// Getting started: a short list of the main things to do, opened when you ask for it (the welcome
// card, Help, search), never pushed at you. It ticks itself off as you do them, in any order, and
// each one's Show me takes you to the real control and points at it with a sentence.
import { useEffect } from "react";
import { create } from "zustand";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { holeStats } from "../lib/holeStats";
import { holeBaskets, holeTees } from "../lib/course";
import { getDoc, useCourse, useEditor } from "../state/course";
import { select } from "../state/actions";
import { getView } from "../state/view";
import type { Where } from "../lib/guide";
import { showSetting } from "./showSetting";
import { FOCUS } from "./ui";

type Flags = { open: boolean; folded: boolean; seen3d: boolean; checks: boolean; map: boolean; export: boolean };
const KEY = "dg-getting-started";
const load = (): Flags => {
  const none = { open: false, folded: false, seen3d: false, checks: false, map: false, export: false };
  try { return { ...none, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return none; }
};
export const useStart = create<Flags & { set: (p: Partial<Flags>) => void }>(set => ({
  ...load(),
  set: p => set(s => {
    const next = { ...s, ...p };
    try { localStorage.setItem(KEY, JSON.stringify({ open: next.open, folded: next.folded, seen3d: next.seen3d, checks: next.checks, map: next.map, export: next.export })); } catch { /* (private window: kept for now only) */ }
    return next;
  })
}));
/** Opens the list (from the welcome card, Help or search). */
export const openGettingStarted = () => useStart.getState().set({ open: true, folded: false });

type Item = { id: string; title: string; done: boolean; where: Where; say: string; before?: () => void };

export function GettingStarted({ phone = false }: { phone?: boolean }) {
  const st = useStart();
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  // (what's been done that the course itself doesn't show)
  useEffect(() => {
    const p: Partial<Flags> = {};
    if (!st.seen3d && (ed.view === "3d" || ed.teeView)) p.seen3d = true;
    if (!st.checks && ed.problemsOpen) p.checks = true;
    if (!st.map && ed.step === "map") p.map = true;
    if (!st.export && ed.step === "export") p.export = true;
    if (Object.keys(p).length) st.set(p);
  }, [ed.view, ed.teeView, ed.problemsOpen, ed.step, st]);
  if (!st.open || useCourse.getState().readOnly) return null;
  const complete = doc.holes.filter(h => holeStats(doc, h).complete);
  const grown = doc.holes.some(h => holeTees(doc, h.id).length > 1 || holeBaskets(doc, h.id).length > 1 || holeBaskets(doc, h.id).some(b => b.holeId !== h.id));
  const items: Item[] = [
    { id: "site", title: "Find your park", done: !!doc.site.bounds, where: { step: "site", find: "find-site" }, say: "Search for the park, frame the area your course will use, and bring it in. The photo, the ground, paths and trees come with it." },
    { id: "hole", title: "Make your first hole", done: complete.length > 0, where: { step: "design", find: phone ? "tool-add-hole" : "new-hole" }, say: `${phone ? "Tap" : "Click"} New hole, then ${phone ? "tap" : "click"} where the tee goes and where the basket goes.`, before: () => useEditor.getState().set({ tool: "add-hole" }) },
    { id: "grow", title: "Add another tee or pin", done: grown, where: { step: "design", pick: "hole", find: phone ? "strip-tees" : "another-tee" }, say: "Another tee gives the same hole a shorter or longer start. A new hole to this basket is a separate hole that finishes there." },
    { id: "3d", title: "Look at it in 3D", done: st.seen3d, where: { find: "view-3d" }, say: "Switch to 3D to see the ground and trees. Pick a hole and use View from tee to stand on it." },
    { id: "checks", title: "Look over the checks", done: st.checks, where: { step: "design", find: phone ? "checks-link" : "problems-button" }, say: "Checks flags holes that cross or run close, throws over roads, and holes with no path to the next one." },
    { id: "map", title: "Make your course map", done: st.map, where: { step: "map" }, say: "The Map step lays out the printed course map, tee signs and scorecard. Pick a look and it repaints." },
    { id: "export", title: "Print or share it", done: st.export, where: { step: "export" }, say: "Export makes the PDFs and image files, the flyover video and the GPS files." }
  ];
  const left = items.filter(i => !i.done).length;
  const done = items.length - left;
  const show = (i: Item) => {
    i.before?.();
    if (i.where.pick === "hole" && !getDoc().holes.length) { useEditor.getState().set({ step: "design", tool: "add-hole" }); return; }
    void showSetting({ ...i.where, say: i.say });
    if (i.where.pick === "hole") requestAnimationFrame(() => { const h = getDoc().holes[0]; if (h && !useEditor.getState().selectedId) { select(h.id); getView()?.fitHole(h.id); } });
  };
  const wrap = phone ? "absolute left-2 right-2 top-[72px] z-30" : "absolute right-3 bottom-12 z-30 w-[272px]";
  return (
    <div className={`${wrap} glass-solid rounded-[18px] shadow-xl shadow-black/40 ring-1 ring-white/10 overflow-hidden pointer-events-auto`} role="region" aria-label="Getting started" data-testid="getting-started">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <button className={`flex-1 min-w-0 text-left ${FOCUS} rounded`} onClick={() => st.set({ folded: !st.folded })} aria-expanded={!st.folded}>
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-50">Getting started {st.folded ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}</span>
          <span className="block mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden"><span className="block h-full bg-orange-300 transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} /></span>
          <span className="block mt-1 text-[11px] text-zinc-400">{left ? `${done} of ${items.length} done` : "All done. You know your way around."}</span>
        </button>
        <button aria-label="Close Getting started" title="Close (open it again from Help)" className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.09] ${FOCUS}`} onClick={() => st.set({ open: false })} data-testid="getting-started-close"><X size={15} /></button>
      </div>
      {!st.folded && (
        <ul className={`px-1.5 pb-1.5 ${phone ? "max-h-[42vh] overflow-y-auto" : ""}`}>
          {items.map(i => (
            <li key={i.id} className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 hover:bg-white/[0.05]" data-testid={`start-${i.id}`} data-done={i.done || undefined}>
              <span className={`w-[18px] h-[18px] shrink-0 rounded-full flex items-center justify-center ${i.done ? "bg-orange-300 text-zinc-950" : "ring-[1.5px] ring-zinc-500"}`}>{i.done && <Check size={12} strokeWidth={3} />}</span>
              <span className={`flex-1 text-[13px] ${i.done ? "text-zinc-400 line-through decoration-zinc-600" : "text-zinc-100 font-semibold"}`}>{i.title}</span>
              {!i.done && <button className={`shrink-0 text-[12px] font-semibold text-orange-300 hover:text-orange-200 px-1.5 py-1 touch:py-2 rounded ${FOCUS}`} onClick={() => show(i)} data-testid={`start-show-${i.id}`}>Show me</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
