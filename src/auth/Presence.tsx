// Who else is in a course being edited live: their faces beside the Live chip (the list says where
// each is), their pointers on the map, and a ring in their color round what they've picked, so two
// people don't move the same thing at once. Each person has one color, the same everywhere.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { FOCUS, HelpLink, MENU_HEAD, POPOVER } from "../components/ui";
import { holeLabel } from "../lib/course";
import { useCourse, useEditor } from "../state/course";
import { getView, onLiveView } from "../state/view";
import type { CourseDoc } from "../types";
import { useAuth } from "./api";
import { CLIENT, sendHere, useLive, type Here, type Person, type Pointer } from "./live";

const COLORS = ["#f9a8d4", "#c4b5fd", "#7dd3fc", "#fcd34d", "#fdba74", "#5eead4", "#fda4af", "#a5b4fc"];
const YOU = "#86efac";
/** A person's color (from who they are: the same on every screen). */
export const colorOf = (userId: string) => {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
};
const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

/** A pointer's name shows while it moves and this long after; the pointer goes after this long
 * still; and fades to a ghost this close to your own pointer (px). */
const NAMED = 2000, IDLE = 60_000, NEAR = 24;

/** Whether you see the others' pointers (their picks show all the same): yours to turn off, kept
 * in this browser. */
const SHOW_KEY = "hyzerlab:show-pointers";
export const usePointerPrefs = create<{ show: boolean; setShow: (on: boolean) => void }>(set => ({
  show: (() => { try { return localStorage.getItem(SHOW_KEY) !== "0"; } catch { return true; } })(),
  setShow: on => { set({ show: on }); try { localStorage.setItem(SHOW_KEY, on ? "1" : "0"); } catch { /* private window */ } }
}));

// Your own pointer, and whether a button is held (theirs fade out of your way)
const mine = { x: -1e4, y: -1e4, held: false };
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", e => { mine.x = e.clientX; mine.y = e.clientY; }, { passive: true, capture: true });
  window.addEventListener("pointerdown", () => { mine.held = true; }, true);
  for (const ev of ["pointerup", "pointercancel", "blur"]) window.addEventListener(ev, () => { mine.held = false; }, true);
}

const others = (people: Person[], me: string | undefined) => people.filter(p => p.userId !== me);

/** Where someone is, for the list: the hole of what they've picked, else how they're looking. */
const whereOf = (at: Here | null | undefined, doc: CourseDoc) => {
  if (!at) return "";
  if (at.picked) {
    const it = doc.items.find(i => i.id === at.picked) as { holeId?: string } | undefined;
    const hole = it?.holeId ?? (doc.holes.some(h => h.id === at.picked) ? at.picked : null);
    if (hole && doc.holes.some(h => h.id === hole)) return `Hole ${holeLabel(doc, hole)}`;
  }
  return at.view === "3d" ? "looking in 3D" : at.view === "map" ? "on the Map step" : "";
};

/** The latest of a person's pointers (they may have the course open in more than one tab). */
const latestOf = (p: Person, pointers: Record<string, Pointer>) =>
  p.clients.map(c => pointers[c]).filter(Boolean).sort((a, b) => b.when - a.when)[0];

/** A person's face: their initial in their color (`bar`: in the top bar, smaller on a phone). */
function Face({ name, color, size = 22, bar = false }: { name: string; color: string; size?: number; bar?: boolean }) {
  return (
    <span className={`grid place-items-center rounded-full font-bold text-zinc-900 border-2 border-[#1b2118] shrink-0 ${bar ? "w-5 h-5 text-[9px] sm:w-[26px] sm:h-[26px] sm:text-[11px]" : ""}`}
      style={bar ? { background: color } : { width: size, height: size, fontSize: size * 0.42, background: color }} aria-hidden>
      {initial(name)}
    </span>
  );
}

/** The others in the course, as small faces (three at most, two on a phone); a click lists them. */
export function Faces() {
  const { on, people, pointers } = useLive();
  const me = useAuth(s => s.session?.user);
  const doc = useCourse(s => s.doc);
  const { show: showPointers, setShow } = usePointerPrefs();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = on ? others(people, me?.id) : [];
  // (closed by a click outside it, Esc, or the others all gone)
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !panel.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  useEffect(() => { if (!list.length) setOpen(false); }, [list.length]);
  if (!list.length) return null;
  const names = list.map(p => p.name).join(", ");
  const r = open ? btn.current?.getBoundingClientRect() : null;
  const phone = window.innerWidth < 640;
  return (
    <>
      <button ref={btn} className={`flex items-center rounded-full ${FOCUS}`} onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Also in this course: ${names}`} title={`Also here: ${names}`} data-testid="live-faces">
        {list.map((p, i) => (
          <span key={p.userId} className={`${i ? "-ml-1.5" : ""} ${i >= 3 ? "hidden" : i >= 2 ? "hidden sm:block" : ""}`}><Face name={p.name} color={colorOf(p.userId)} bar /></span>
        ))}
        {list.length > 2 && <span className="sm:hidden -ml-1.5 grid place-items-center w-5 h-5 rounded-full bg-zinc-700 border-2 border-[#1b2118] text-[10px] font-bold text-zinc-100">+{list.length - 2}</span>}
        {list.length > 3 && <span className="hidden sm:grid -ml-1.5 place-items-center w-[26px] h-[26px] rounded-full bg-zinc-700 border-2 border-[#1b2118] text-[10px] font-bold text-zinc-100">+{list.length - 3}</span>}
      </button>
      {open && r && createPortal(
        <div ref={panel} className={`fixed ${POPOVER} py-1.5 z-50 text-[13px]`} role="dialog" aria-label="In this course now" data-testid="live-people"
          style={phone ? { left: 8, right: 8, top: r.bottom + 8 } : { right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 6, width: 256 }}>
          <div className={`${MENU_HEAD} flex items-center gap-1.5`}>In this course now<HelpLink topic="live-together" label="Editing together, live" /></div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 text-zinc-100"><Face name={me?.displayName || me?.username || "You"} color={YOU} size={22} />You</div>
          {list.map(p => (
            <div key={p.userId} className="flex items-center gap-2.5 px-3 py-1.5 text-zinc-100" data-testid="live-person">
              <Face name={p.name} color={colorOf(p.userId)} size={22} />
              <span className="truncate">{p.name}</span>
              <small className="ml-auto text-zinc-400 whitespace-nowrap">{whereOf(latestOf(p, pointers)?.at, doc)}</small>
            </div>
          ))}
          <div className="border-t border-white/[0.08] my-1.5" />
          <label className="flex items-center gap-2.5 px-3 py-1.5 text-zinc-100 cursor-pointer">
            Show their pointers
            <input type="checkbox" className="sr-only peer" checked={showPointers} onChange={e => setShow(e.target.checked)} data-testid="show-pointers" />
            <span aria-hidden className="ml-auto relative w-[30px] h-[17px] rounded-full bg-zinc-600 peer-checked:bg-emerald-400 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 transition-colors after:absolute after:top-[2px] after:left-[2px] after:w-[13px] after:h-[13px] after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-[13px]" />
          </label>
        </div>,
        document.body
      )}
    </>
  );
}

const ARROW = "M1 1 L1 18 L5.5 13.5 L9 21 L12 19.6 L8.6 12.4 L15 12.4 Z";

/** The others' pointers over the map (small, named while they move, a ghost near yours), and what
 * they've picked outlined on the map itself (named while they drag it). */
export function PresenceLayer() {
  const { on, pointers } = useLive();
  const me = useAuth(s => s.session?.user?.id);
  const doc = useCourse(s => s.doc);
  const step = useEditor(s => s.step);
  const show = usePointerPrefs(s => s.show);
  const [, bump] = useState(0);
  const [view, setView] = useState(getView);
  useEffect(() => onLiveView(setView), []);
  // (moved with the map, with your own pointer, and as time goes)
  useEffect(() => {
    if (!view) return;
    const off = view.onView(() => bump(n => n + 1));
    let frame = 0;
    const soon = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; bump(n => n + 1); }); };
    window.addEventListener("pointermove", soon, { passive: true });
    window.addEventListener("pointerdown", soon);
    window.addEventListener("pointerup", soon);
    const t = window.setInterval(() => bump(n => n + 1), 500);
    return () => {
      off();
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", soon);
      window.removeEventListener("pointerdown", soon);
      window.removeEventListener("pointerup", soon);
      window.clearInterval(t);
    };
  }, [view]);
  const shownHere = on && !!view && step !== "map" && step !== "export";
  const now = Date.now();
  const others = shownHere ? Object.entries(pointers).filter(([c, p]) => c !== CLIENT && p.userId !== me && p.at) : [];
  // (each picked thing once: by whoever picked it last; strong while they drag it)
  const picks = new Map<string, Pointer>();
  for (const [, p] of others) {
    const id = p.at!.picked;
    if (id && (doc.items.some(i => i.id === id) || doc.holes.some(h => h.id === id)) && (!picks.get(id) || picks.get(id)!.when < p.when)) picks.set(id, p);
  }
  const dragging = (p: Pointer) => !!p.at?.drag && now - p.movedAt < 1500;
  const key = JSON.stringify([...picks].map(([id, p]) => [id, p.userId, dragging(p)]));
  useEffect(() => {
    if (!view) return;
    view.setOthersPicked(JSON.parse(key).map(([id, userId, strong]: [string, string, boolean]) => ({ id, color: colorOf(userId), strong })));
  }, [view, key]);
  useEffect(() => () => view?.setOthersPicked([]), [view]);
  if (!shownHere || !view) return null;
  const rect = document.querySelector("[data-testid=plan]")?.getBoundingClientRect();
  if (!rect) return null;
  const inside = (x: number, y: number) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const youDrag = mine.held && inside(mine.x, mine.y);
  return (
    <div className="fixed inset-0 pointer-events-none z-[15]" data-testid="live-presence">
      {[...picks].filter(([, p]) => dragging(p)).map(([id, p]) => {
        const b = view.screenBox(id);
        if (!b) return null;
        const x = rect.left + b.x + b.width / 2, y = rect.top + b.y;
        if (!inside(x, y)) return null;
        return (
          <b key={id} className="absolute -translate-x-1/2 -translate-y-full -mt-1.5 px-1.5 rounded-full text-[10px] font-semibold text-zinc-900 whitespace-nowrap shadow" data-testid="live-pick-name"
            style={{ left: x, top: y, background: colorOf(p.userId) }}>{p.name}</b>
        );
      })}
      {show && others.map(([client, p]) => {
        const at = p.at!;
        if (at.x == null || at.y == null || now - p.movedAt > IDLE) return null;
        const q = view.toClient(at.x, at.y);
        if (!q || !inside(q.x, q.y)) return null;
        const c = colorOf(p.userId);
        const moving = now - p.movedAt < NAMED;
        const near = Math.hypot(q.x - mine.x, q.y - mine.y) < NEAR;
        const ghost = near || youDrag;
        // (named while they move, and when yours comes close: who it is, the arrow out of your way)
        const named = near || (moving && !youDrag);
        return (
          <div key={client} className="absolute transition-[left,top] duration-150 ease-linear" data-testid="live-pointer" data-name={p.name} style={{ left: q.x, top: q.y }}>
            <svg width="12" height="15" viewBox="0 0 18 22" className="block drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.65)] transition-opacity duration-150" style={{ opacity: ghost ? 0.22 : moving ? 1 : 0.85 }}>
              <path d={ARROW} fill={c} stroke="#1b2118" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            {named && <span className="absolute left-[9px] top-3 px-1.5 rounded-full text-[11px] font-semibold text-zinc-900 whitespace-nowrap max-w-[120px] truncate shadow" style={{ background: c }}>{p.name}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Says where you are to the others: the mouse over the map (a finger's taps aren't sent), what
 * you've picked, and how you're looking. */
export function useSendHere() {
  const on = useLive(s => s.on && s.connected);
  useEffect(() => {
    if (!on) return;
    let x: number | null = null, y: number | null = null;
    const now = (): Here => {
      const e = useEditor.getState();
      const picked = e.selectedId ?? e.group[0] ?? null;
      return { x, y, picked, view: e.step === "map" || e.step === "export" ? "map" : e.view, drag: !!picked && !!getView()?.isDragging() };
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") return;
      const el = ev.target instanceof Element ? ev.target.closest("[data-testid=plan]") : null;
      const p = el ? getView()?.toPlan(ev.clientX, ev.clientY) : null;
      const nx = p ? Math.round(p.x * 10) / 10 : null, ny = p ? Math.round(p.y * 10) / 10 : null;
      if (nx === x && ny === y) return;
      x = nx; y = ny;
      sendHere(now());
    };
    const away = () => { if (x === null) return; x = y = null; sendHere(now()); };
    // (let go: not dragging any more)
    const up = () => sendHere(now());
    const hidden = () => { if (document.hidden) away(); };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    document.documentElement.addEventListener("pointerleave", away);
    document.addEventListener("visibilitychange", hidden);
    const off = useEditor.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId || s.group !== prev.group || s.step !== prev.step || s.view !== prev.view) sendHere(now());
    });
    sendHere(now());
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeEventListener("pointerleave", away);
      document.removeEventListener("visibilitychange", hidden);
      off();
    };
  }, [on]);
}
