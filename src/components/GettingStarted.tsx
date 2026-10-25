// Getting started: a short list of the main things to do, opened when you ask for it (the welcome
// card, Help, search), never pushed at you. It ticks itself off as you do them, in any order, and
// each one's Show me takes you to the real control and points at it with a sentence. What's been
// done in a course of your own stays ticked, whichever course is open. While the example is open
// the list starts with Start your own course (the example is someone else's). The Courses page has
// a card for it: the same items, ticked as the list is.
import { useEffect } from "react";
import { create } from "zustand";
import { Check, ChevronDown, ChevronUp, ListChecks, Plus, X } from "lucide-react";
import { holeStats } from "../lib/holeStats";
import { holeBaskets, holeTees } from "../lib/course";
import { EXAMPLE_ID } from "../lib/example";
import { getDoc, useCourse, useEditor } from "../state/course";
import { select } from "../state/actions";
import { getView } from "../state/view";
import { useExportJob } from "../state/exportJob";
import { newCourse } from "../state/files";
import type { Where } from "../lib/guide";
import type { CourseDoc } from "../types";
import { askOpen, showSetting } from "./showSetting";
import { toast, useToasts } from "../state/toast";
import { FOCUS } from "./ui";
import { useLayout, useTouch } from "./useLayout";
import { useTour } from "./Tour";

/** `ticked`: items ticked off by hand (done another way, or not needed); `unticked`: ones untouched by hand. */
/** `onHome`: false once its card is taken off the Courses page (it can be put back). The rest:
 * done once in a course of your own (kept, whichever course is open now). */
type Flags = { open: boolean; folded: boolean; site: boolean; hole: boolean; grow: boolean; seen3d: boolean; checks: boolean; map: boolean; export: boolean; ticked: string[]; unticked: string[]; onHome: boolean };
const KEY = "dg-getting-started";
const FIELDS = ["open", "folded", "site", "hole", "grow", "seen3d", "checks", "map", "export", "ticked", "unticked", "onHome"] as const;
const load = (): Flags => {
  const none: Flags = { open: false, folded: false, site: false, hole: false, grow: false, seen3d: false, checks: false, map: false, export: false, ticked: [], unticked: [], onHome: true };
  try { return { ...none, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return none; }
};
export const useStart = create<Flags & { set: (p: Partial<Flags>) => void }>(set => ({
  ...load(),
  set: p => set(s => {
    const next = { ...s, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(FIELDS.map(k => [k, next[k]])))); } catch { /* (private window: kept for now only) */ }
    return next;
  })
}));
/** Opens the list (from the welcome card, Help or search). */
export const openGettingStarted = () => useStart.getState().set({ open: true, folded: false });

/** A course of your own in place of the example: a new, empty one, with Find your park opened. */
export const startOwnCourse = async () => {
  await newCourse();
  askOpen("find-site");
};

type Item = { id: string; title: string; done: boolean; where: Where; say: string; before?: () => void };

/** What the open course shows done (the example is someone else's: nothing). */
const courseDone = (doc: CourseDoc) => {
  if (doc.id === EXAMPLE_ID) return { site: false, hole: false, grow: false };
  return {
    site: !!doc.site.bounds,
    hole: doc.holes.some(h => holeStats(doc, h).complete),
    grow: doc.holes.some(h => holeTees(doc, h.id).length > 1 || holeBaskets(doc, h.id).length > 1 || holeBaskets(doc, h.id).some(b => b.holeId !== h.id))
  };
};

/** The list, ticked as far as what's been done goes. `phone`, `compact` (a phone or a tablet's
 * rail) and `touch` pick the controls pointed at and the words. */
const startItems = (doc: CourseDoc, st: Flags, { phone = false, compact = false, touch = false } = {}): Item[] => {
  const now = courseDone(doc);
  const tap = touch ? "Tap" : "Click";
  const items: Item[] = [
    { id: "site", title: "Find your park", done: st.site || now.site, where: { step: "site", find: "find-site|welcome-find|resize-site" }, say: "Search for the park, frame the area your course will use, and bring it in. The photo, the ground, paths and trees come with it." },
    // (the tool turned on first: the hint says what to do with it)
    { id: "hole", title: "Make your first hole", done: st.hole || now.hole, where: { step: "design", find: compact ? "tool-hole" : "new-hole" }, say: `${compact ? "The Hole tool" : "New hole"} is on. ${tap} where the tee goes, then where the basket goes.`, before: () => useEditor.getState().set({ tool: "add-hole" }) },
    { id: "grow", title: "Add another tee or pin", done: st.grow || now.grow, where: { step: "design", pick: "hole", find: phone ? "strip-tees" : "another-tee" }, say: "Another tee gives the same hole a shorter or longer start. A new hole to this basket is a separate hole that finishes there." },
    { id: "3d", title: "Look at it in 3D", done: st.seen3d, where: { step: "design", find: "view-3d" }, say: "Switch to 3D to see the ground and trees. Pick a hole and use View from the tee to stand on it." },
    { id: "checks", title: "Look over the checks", done: st.checks, where: { step: "design", find: "problems-button" }, say: "Checks flags holes that cross or run close, throws over roads, and holes with no path to the next one." },
    { id: "map", title: "Pick a map style", done: st.map, where: { step: "map", tab: "map", find: "map-style" }, say: "The Map step lays out the printed course map, tee signs and scorecard. Pick a style and the map repaints." },
    { id: "export", title: "Download the files", done: st.export, where: { step: "export" }, say: "Export makes the PDFs and image files, the flyover video and the GPS files." }
  ];
  // (ticked or unticked by hand: that wins over what's been done)
  for (const i of items) { if (st.ticked.includes(i.id)) i.done = true; else if (st.unticked.includes(i.id)) i.done = false; }
  return items;
};

/** The items and how far along they are: the same the list itself shows. */
export function useStartProgress() {
  const st = useStart();
  const doc = useCourse(s => s.doc);
  const items = startItems(doc, st);
  return { items, done: items.filter(i => i.done).length, of: items.length };
}

/** The Courses page's card for the list: its items, ticked as far as they go, and the way in.
 * Its × takes it off the page (Show Getting started, under Learn the app, puts it back). */
export function StartCard({ onOpen, disabled }: { onOpen: () => void; disabled?: boolean }) {
  const st = useStart();
  const { items, done, of } = useStartProgress();
  if (!st.onHome) return null;
  return (
    <div className="glass rounded-[22px] p-4" data-testid="home-start">
      <div className="flex items-center gap-2 text-[14px] font-bold text-zinc-50"><ListChecks size={17} className="text-orange-300" /><span className="flex-1">Getting started</span>
        <button className="w-7 h-7 -m-1 touch:w-11 touch:h-11 touch:-m-3 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.08]" aria-label="Take Getting started off the Courses page" title="Take it off (Show Getting started under Learn the app brings it back)" onClick={() => st.set({ onHome: false })} data-testid="home-start-hide"><X size={15} /></button></div>
      <ul className="mt-2 space-y-1" data-testid="home-start-items">
        {items.map(i => (
          <li key={i.id} className="flex items-center gap-2 text-[12.5px]" data-done={i.done || undefined}>
            <span className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${i.done ? "bg-orange-300 text-zinc-950" : "ring-[1.5px] ring-zinc-600"}`} aria-hidden>{i.done && <Check size={10} strokeWidth={3} />}</span>
            <span className={i.done ? "text-zinc-500 line-through decoration-zinc-600" : "text-zinc-200"}>{i.title}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-400" data-testid="home-start-progress">{done} of {of} done</p>
      <button className="mt-3 w-full rounded-full px-3 py-2 touch:py-3 text-[13px] font-semibold bg-white/[0.1] hover:bg-white/[0.16] text-zinc-50" onClick={onOpen} disabled={disabled} data-testid="home-start-open">{done ? "Pick up where you left off" : "Open the list"}</button>
    </div>
  );
}

/** Keeps what's been done in a course of your own: the course's own items, 3D, Checks, a map
 * style picked, an export finished (not on the walk round the example, nor in the example). */
function useStartTicks() {
  const st = useStart();
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const touring = useTour(s => s.at !== null);
  const own = doc.id !== EXAMPLE_ID;
  useEffect(() => {
    if (touring || !own) return;
    const now = courseDone(doc);
    const p: Partial<Flags> = {};
    if (!st.site && now.site) p.site = true;
    if (!st.hole && now.hole) p.hole = true;
    if (!st.grow && now.grow) p.grow = true;
    if (!st.seen3d && (ed.view === "3d" || ed.teeView)) p.seen3d = true;
    if (!st.checks && ed.problemsOpen) p.checks = true;
    if (Object.keys(p).length) st.set(p);
  }, [doc, ed.view, ed.teeView, ed.problemsOpen, st, touring, own]);
  // (a map style picked: the course's look changed by one)
  useEffect(() => useCourse.subscribe((s, prev) => {
    const a = s.doc.style, b = prev.doc.style;
    if (s.doc.id !== prev.doc.id || s.doc.id === EXAMPLE_ID || useTour.getState().at !== null || useStart.getState().map) return;
    if (a.mapLook !== b.mapLook || a.theme !== b.theme) useStart.getState().set({ map: true });
  }), []);
  // (an export finished: its job over with no Cancelled or error said for it)
  useEffect(() => useExportJob.subscribe((s, prev) => {
    if (!prev.job || s.job || getDoc().id === EXAMPLE_ID || useTour.getState().at !== null || useStart.getState().export) return;
    const list = useToasts.getState().toasts;
    const last = list[list.length - 1];
    const failed = !!last && (last.tone === "error" || /^Cancelled/.test(last.text));
    if (!failed) useStart.getState().set({ export: true });
  }), []);
}

/** The list over the map: under the top bar on a phone (clear of the map's buttons on the right),
 * at the map's top left beside a tablet's panel, at its bottom right on a computer. */
export function GettingStarted({ phone = false, rail = false }: { phone?: boolean; rail?: boolean }) {
  const st = useStart();
  const doc = useCourse(s => s.doc);
  const touch = useTouch();
  const compact = useLayout() !== "desktop";
  useStartTicks();
  if (!st.open || useCourse.getState().readOnly) return null;
  // (the example open: a course of your own first; what's in the example points at nothing of yours)
  const example = doc.id === EXAMPLE_ID;
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
          {example && (
            <li className="px-1.5 pb-1.5">
              <button className={`w-full rounded-full px-3 py-1.5 touch:min-h-[44px] text-[13px] font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950 inline-flex items-center justify-center gap-1.5 ${FOCUS}`} onClick={() => void startOwnCourse()} data-testid="start-own-course"><Plus size={15} /> Start your own course</button>
            </li>
          )}
          {items.map(i => (
            <li key={i.id} className={`flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 touch:py-0.5 ${example ? "opacity-45" : "hover:bg-white/[0.05]"}`} data-testid={`start-${i.id}`} data-done={i.done || undefined}>
              {/* (a finger gets the whole 44 px around the circle) */}
              <button role="checkbox" aria-checked={i.done} aria-label={`${i.title}: ${i.done ? "done" : "not done"}`} title={i.done ? "Untick it" : "Tick it off"} onClick={() => tick(i)} disabled={example} data-testid={`start-tick-${i.id}`}
                className={`group w-[22px] h-[22px] touch:w-11 touch:h-11 touch:-mx-2 shrink-0 rounded-full flex items-center justify-center ${FOCUS}`}>
                <span className={`w-[22px] h-[22px] touch:w-7 touch:h-7 rounded-full flex items-center justify-center ${i.done ? "bg-orange-300 text-zinc-950" : "ring-[1.5px] ring-zinc-500 group-hover:ring-orange-300"}`}>{i.done && <Check size={13} strokeWidth={3} />}</span>
              </button>
              <span className={`flex-1 text-[13px] ${i.done ? "text-zinc-400 line-through decoration-zinc-600" : "text-zinc-100 font-semibold"}`}>{i.title}</span>
              {!i.done && !example && <button className={`shrink-0 text-[12px] font-semibold text-orange-300 hover:text-orange-200 px-1.5 py-1 touch:min-h-[44px] touch:px-2.5 rounded ${FOCUS}`} onClick={() => show(i)} data-testid={`start-show-${i.id}`}>Show me</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
