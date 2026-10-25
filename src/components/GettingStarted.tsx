// Getting started: a short list of the main things to do, opened when you ask for it (the welcome
// card, Help, search), never pushed at you. It ticks itself off as you do them, in any order, and
// each one's Show me takes you to the real control and points at it with a sentence. The Courses
// page has a card for it, saying how far along it is (the same count as the list's).
import { useEffect } from "react";
import { create } from "zustand";
import { Check, ChevronDown, ChevronUp, ListChecks, X } from "lucide-react";
import { holeStats } from "../lib/holeStats";
import { holeBaskets, holeTees } from "../lib/course";
import { EXAMPLE_ID } from "../lib/example";
import { getDoc, useCourse, useEditor } from "../state/course";
import { select } from "../state/actions";
import { getView } from "../state/view";
import type { Where } from "../lib/guide";
import type { CourseDoc } from "../types";
import { showSetting } from "./showSetting";
import { toast } from "../state/toast";
import { FOCUS } from "./ui";
import { useLayout, useTouch } from "./useLayout";
import { useTour } from "./Tour";

/** `ticked`: items ticked off by hand (done another way, or not needed); `unticked`: ones untouched by hand. */
/** `onHome`: false once its card is taken off the Courses page (it can be put back). */
type Flags = { open: boolean; folded: boolean; seen3d: boolean; checks: boolean; map: boolean; export: boolean; ticked: string[]; unticked: string[]; onHome: boolean };
const KEY = "dg-getting-started";
const load = (): Flags => {
  const none = { open: false, folded: false, seen3d: false, checks: false, map: false, export: false, ticked: [] as string[], unticked: [] as string[], onHome: true };
  try { return { ...none, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return none; }
};
export const useStart = create<Flags & { set: (p: Partial<Flags>) => void }>(set => ({
  ...load(),
  set: p => set(s => {
    const next = { ...s, ...p };
    try { localStorage.setItem(KEY, JSON.stringify({ open: next.open, folded: next.folded, seen3d: next.seen3d, checks: next.checks, map: next.map, export: next.export, ticked: next.ticked, unticked: next.unticked, onHome: next.onHome })); } catch { /* (private window: kept for now only) */ }
    return next;
  })
}));
/** Opens the list (from the welcome card, Help or search). */
export const openGettingStarted = () => useStart.getState().set({ open: true, folded: false });

/** What the list is, said the same on every Courses page. */
export const START_TEXT = "A short list of the main things to do for a course of your own, from finding your park to printing tee signs. It ticks itself off as you go, and Show me points at each one.";

type Item = { id: string; title: string; done: boolean; where: Where; say: string; before?: () => void };

/** The list, ticked as far as the course and what's been looked at go. `phone`, `compact` (a
 * phone or a tablet's rail) and `touch` pick the controls pointed at and the words. */
const startItems = (doc: CourseDoc, st: Flags, { phone = false, compact = false, touch = false } = {}): Item[] => {
  // (the example is someone else's course: what's in it doesn't tick anything off)
  const own = doc.id !== EXAMPLE_ID;
  const complete = own ? doc.holes.filter(h => holeStats(doc, h).complete) : [];
  const grown = own && doc.holes.some(h => holeTees(doc, h.id).length > 1 || holeBaskets(doc, h.id).length > 1 || holeBaskets(doc, h.id).some(b => b.holeId !== h.id));
  const tap = touch ? "Tap" : "Click";
  const items: Item[] = [
    { id: "site", title: "Find your park", done: own && !!doc.site.bounds, where: { step: "site", find: "find-site" }, say: "Search for the park, frame the area your course will use, and bring it in. The photo, the ground, paths and trees come with it." },
    // (the tool turned on first: the hint says what to do with it)
    { id: "hole", title: "Make your first hole", done: complete.length > 0, where: { step: "design", find: compact ? "tool-hole" : "new-hole" }, say: `${compact ? "The Hole tool" : "New hole"} is on. ${tap} where the tee goes, then where the basket goes.`, before: () => useEditor.getState().set({ tool: "add-hole" }) },
    { id: "grow", title: "Add another tee or pin", done: grown, where: { step: "design", pick: "hole", find: phone ? "strip-tees" : "another-tee" }, say: "Another tee gives the same hole a shorter or longer start. A new hole to this basket is a separate hole that finishes there." },
    { id: "3d", title: "Look at it in 3D", done: st.seen3d, where: { step: "design", find: "view-3d" }, say: "Switch to 3D to see the ground and trees. Pick a hole and use View from the tee to stand on it." },
    { id: "checks", title: "Look over the checks", done: st.checks, where: { step: "design", find: compact ? "checks-link" : "problems-button" }, say: "Checks flags holes that cross or run close, throws over roads, and holes with no path to the next one." },
    { id: "map", title: "Pick a map style", done: st.map, where: { step: "map", tab: "map", find: "map-style" }, say: "The Map step lays out the printed course map, tee signs and scorecard. Pick a style and the map repaints." },
    { id: "export", title: "Download the files", done: st.export, where: { step: "export" }, say: "Export makes the PDFs and image files, the flyover video and the GPS files." }
  ];
  // (ticked or unticked by hand: that wins over what the course shows)
  for (const i of items) { if (st.ticked.includes(i.id)) i.done = true; else if (st.unticked.includes(i.id)) i.done = false; }
  return items;
};

/** How far along the list is: the same count the list itself shows. */
export function useStartProgress() {
  const st = useStart();
  const doc = useCourse(s => s.doc);
  const items = startItems(doc, st);
  return { done: items.filter(i => i.done).length, of: items.length };
}

/** The Courses page's card for the list: what it is, how far along, and the way in. Its × takes
 * it off the page (Show Getting started, under Learn the app, puts it back). */
export function StartCard({ onOpen, disabled }: { onOpen: () => void; disabled?: boolean }) {
  const st = useStart();
  const { done, of } = useStartProgress();
  if (!st.onHome) return null;
  return (
    <div className="glass rounded-[22px] p-4" data-testid="home-start">
      <div className="flex items-center gap-2 text-[14px] font-bold text-zinc-50"><ListChecks size={17} className="text-orange-300" /><span className="flex-1">Getting started</span>
        <button className="w-7 h-7 -m-1 touch:w-11 touch:h-11 touch:-m-3 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.08]" aria-label="Take Getting started off the Courses page" title="Take it off (Show Getting started under Learn the app brings it back)" onClick={() => st.set({ onHome: false })} data-testid="home-start-hide"><X size={15} /></button></div>
      <p className="text-[13px] text-zinc-400 mt-1.5 leading-snug">{START_TEXT}</p>
      <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-orange-300" style={{ width: `${(done / of) * 100}%` }} /></div>
      <p className="mt-1 text-[11px] text-zinc-400" data-testid="home-start-progress">{done} of {of} done</p>
      <button className="mt-3 w-full rounded-full px-3 py-2 touch:py-3 text-[13px] font-semibold bg-white/[0.1] hover:bg-white/[0.16] text-zinc-50" onClick={onOpen} disabled={disabled} data-testid="home-start-open">{done ? "Pick up where you left off" : "Open the list"}</button>
    </div>
  );
}

/** The list over the map: under the top bar on a phone (clear of the map's buttons on the right),
 * at the map's top left beside a tablet's panel, at its bottom right on a computer. */
export function GettingStarted({ phone = false, rail = false }: { phone?: boolean; rail?: boolean }) {
  const st = useStart();
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const touch = useTouch();
  const compact = useLayout() !== "desktop";
  // (the walk round the example shows these too: it ticks nothing off, and neither does the example)
  const touring = useTour(s => s.at !== null);
  const own = doc.id !== EXAMPLE_ID;
  // (what's been done that the course itself doesn't show)
  useEffect(() => {
    if (touring || !own) return;
    const p: Partial<Flags> = {};
    if (!st.seen3d && (ed.view === "3d" || ed.teeView)) p.seen3d = true;
    if (!st.checks && ed.problemsOpen) p.checks = true;
    if (!st.map && ed.step === "map") p.map = true;
    if (!st.export && ed.step === "export") p.export = true;
    if (Object.keys(p).length) st.set(p);
  }, [ed.view, ed.teeView, ed.problemsOpen, ed.step, st, touring, own]);
  if (!st.open || useCourse.getState().readOnly) return null;
  const items = startItems(doc, st, { phone, compact, touch });
  const tick = (i: Item) => {
    const on = !i.done;
    st.set({ ticked: on ? [...st.ticked.filter(x => x !== i.id), i.id] : st.ticked.filter(x => x !== i.id), unticked: on ? st.unticked.filter(x => x !== i.id) : [...st.unticked.filter(x => x !== i.id), i.id] });
  };
  const close = () => { st.set({ open: false }); toast(compact ? "Getting started is in the menu (top left) whenever you want it back." : "Getting started is at the top, by the ?, whenever you want it back.", "info"); };
  const left = items.filter(i => !i.done).length;
  const done = items.length - left;
  const show = (i: Item) => {
    if (i.where.pick === "hole" && !getDoc().holes.length) { useEditor.getState().set({ step: "design", tool: "add-hole" }); return; }
    void showSetting({ ...i.where, say: i.say });
    // (after: going to the step puts its Select tool back first)
    i.before?.();
    if (i.where.pick === "hole") requestAnimationFrame(() => { const h = getDoc().holes[0]; if (h && !useEditor.getState().selectedId) { select(h.id); getView()?.fitHole(h.id); } });
    // (a phone: folded out of the way of what it points at)
    if (phone) st.set({ folded: true });
  };
  const wrap = phone ? "absolute left-2 right-[60px] top-[72px] z-30" : rail ? "absolute left-3 top-3 z-30 w-[272px] max-w-[calc(100%-76px)]" : "absolute right-3 bottom-12 z-30 w-[272px]";
  return (
    <div className={`${wrap} glass-solid rounded-[18px] shadow-xl shadow-black/40 ring-1 ring-white/10 overflow-hidden pointer-events-auto`} role="region" aria-label="Getting started" data-testid="getting-started">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <button className={`flex-1 min-w-0 text-left ${FOCUS} rounded`} onClick={() => st.set({ folded: !st.folded })} aria-expanded={!st.folded}>
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-50">Getting started {st.folded ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}</span>
          <span className="block mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden"><span className="block h-full bg-orange-300 transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} /></span>
          <span className="block mt-1 text-[11px] text-zinc-400">{left ? `${done} of ${items.length} done` : "All done."}</span>
        </button>
        <button aria-label="Close Getting started" title={compact ? "Close (it's in the menu when you want it back)" : "Close (it's at the top, by the ?, when you want it back)"} className={`w-7 h-7 touch:w-11 touch:h-11 touch:-mr-2 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.09] ${FOCUS}`} onClick={close} data-testid="getting-started-close"><X size={15} /></button>
      </div>
      {!st.folded && (
        <ul className={`px-1.5 pb-1.5 ${phone ? "max-h-[42vh] overflow-y-auto" : ""}`}>
          {items.map(i => (
            <li key={i.id} className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 touch:py-0.5 hover:bg-white/[0.05]" data-testid={`start-${i.id}`} data-done={i.done || undefined}>
              {/* (a finger gets the whole 44 px around the circle) */}
              <button role="checkbox" aria-checked={i.done} aria-label={`${i.title}: ${i.done ? "done" : "not done"}`} title={i.done ? "Untick it" : "Tick it off"} onClick={() => tick(i)} data-testid={`start-tick-${i.id}`}
                className={`group w-[22px] h-[22px] touch:w-11 touch:h-11 touch:-mx-2 shrink-0 rounded-full flex items-center justify-center ${FOCUS}`}>
                <span className={`w-[22px] h-[22px] touch:w-7 touch:h-7 rounded-full flex items-center justify-center ${i.done ? "bg-orange-300 text-zinc-950" : "ring-[1.5px] ring-zinc-500 group-hover:ring-orange-300"}`}>{i.done && <Check size={13} strokeWidth={3} />}</span>
              </button>
              <span className={`flex-1 text-[13px] ${i.done ? "text-zinc-400 line-through decoration-zinc-600" : "text-zinc-100 font-semibold"}`}>{i.title}</span>
              {!i.done && <button className={`shrink-0 text-[12px] font-semibold text-orange-300 hover:text-orange-200 px-1.5 py-1 touch:min-h-[44px] touch:px-2.5 rounded ${FOCUS}`} onClick={() => show(i)} data-testid={`start-show-${i.id}`}>Show me</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
