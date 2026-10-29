// Who else is in a course being edited live: their faces beside the Live chip (the list says where
// each is), their pointers on the map, and a ring in their color round what they've picked, so two
// people don't move the same thing at once. Each person has one color, the same everywhere.
import { useEffect, useState } from "react";
import { FOCUS, HelpLink, MENU_HEAD, POPOVER } from "../components/ui";
import { holeLabel } from "../lib/course";
import { useCourse, useEditor } from "../state/course";
import { getView, onLiveView } from "../state/view";
import type { CourseDoc } from "../types";
import { useAuth } from "./api";
import { CLIENT, sendHere, useLive, type Here, type Person, type Pointer } from "./live";
import { useMenu } from "./AccountMenu";

const COLORS = ["#f9a8d4", "#c4b5fd", "#7dd3fc", "#fcd34d", "#fdba74", "#5eead4", "#fda4af", "#a5b4fc"];
const YOU = "#86efac";
/** A person's color (from who they are: the same on every screen). */
export const colorOf = (userId: string) => {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
};
const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

/** Pointers fade after this long still, and go a little after. */
const FADE = 4000, GONE = 6000;

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

function Face({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  return (
    <span className="grid place-items-center rounded-full font-bold text-zinc-900 border-2 border-[#1b2118] shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, background: color }} aria-hidden>
      {initial(name)}
    </span>
  );
}

/** The others in the course, as small faces (three at most, two on a phone); a click lists them. */
export function Faces() {
  const { on, people, pointers } = useLive();
  const me = useAuth(s => s.session?.user);
  const doc = useCourse(s => s.doc);
  const m = useMenu();
  const list = on ? others(people, me?.id) : [];
  if (!list.length) return null;
  const names = list.map(p => p.name).join(", ");
  return (
    <div className="relative" ref={m.ref}>
      <button className={`flex items-center rounded-full ${FOCUS}`} onClick={() => m.setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={m.open}
        aria-label={`Also in this course: ${names}`} title={`Also here: ${names}`} data-testid="live-faces">
        {list.map((p, i) => (
          <span key={p.userId} className={`${i ? "-ml-1.5" : ""} ${i >= 3 ? "hidden" : i >= 2 ? "hidden sm:block" : ""}`}><Face name={p.name} color={colorOf(p.userId)} /></span>
        ))}
        {list.length > 2 && <span className="sm:hidden -ml-1.5 grid place-items-center w-[26px] h-[26px] rounded-full bg-zinc-700 border-2 border-[#1b2118] text-[10px] font-bold text-zinc-100">+{list.length - 2}</span>}
        {list.length > 3 && <span className="hidden sm:grid -ml-1.5 place-items-center w-[26px] h-[26px] rounded-full bg-zinc-700 border-2 border-[#1b2118] text-[10px] font-bold text-zinc-100">+{list.length - 3}</span>}
      </button>
      {m.open && (
        <div className={`absolute right-0 top-full mt-1 w-64 ${POPOVER} py-1.5 z-50 text-[13px]`} role="dialog" aria-label="In this course now" data-testid="live-people">
          <div className={`${MENU_HEAD} flex items-center gap-1.5`}>In this course now<HelpLink topic="live-together" label="Editing together, live" /></div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 text-zinc-100"><Face name={me?.displayName || me?.username || "You"} color={YOU} size={22} />You</div>
          {list.map(p => (
            <div key={p.userId} className="flex items-center gap-2.5 px-3 py-1.5 text-zinc-100" data-testid="live-person">
              <Face name={p.name} color={colorOf(p.userId)} size={22} />
              <span className="truncate">{p.name}</span>
              <small className="ml-auto text-zinc-400 whitespace-nowrap">{whereOf(latestOf(p, pointers)?.at, doc)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ARROW = "M1 1 L1 18 L5.5 13.5 L9 21 L12 19.6 L8.6 12.4 L15 12.4 Z";

/** The others' pointers and what they've picked, over the map. */
export function PresenceLayer() {
  const { on, pointers } = useLive();
  const me = useAuth(s => s.session?.user?.id);
  const doc = useCourse(s => s.doc);
  const step = useEditor(s => s.step);
  const [, bump] = useState(0);
  const [view, setView] = useState(getView);
  useEffect(() => onLiveView(setView), []);
  // (moved with the map, and the pointers faded as time goes)
  useEffect(() => {
    if (!view) return;
    const off = view.onView(() => bump(n => n + 1));
    const t = window.setInterval(() => bump(n => n + 1), 1000);
    return () => { off(); window.clearInterval(t); };
  }, [view]);
  if (!on || !view || step === "map" || step === "export") return null;
  const el = document.querySelector("[data-testid=plan]");
  const rect = el?.getBoundingClientRect();
  if (!rect) return null;
  const now = Date.now();
  const inside = (x: number, y: number) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const shown = Object.entries(pointers).filter(([c, p]) => c !== CLIENT && p.userId !== me && p.at);
  // (each picked thing ringed once: by whoever picked it last)
  const rings = new Map<string, Pointer>();
  for (const [, p] of shown) if (p.at!.picked && (!rings.get(p.at!.picked) || rings.get(p.at!.picked)!.when < p.when)) rings.set(p.at!.picked, p);
  return (
    <div className="fixed inset-0 pointer-events-none z-[15]" data-testid="live-presence">
      {[...rings].map(([id, p]) => {
        if (!doc.items.some(i => i.id === id) && !doc.holes.some(h => h.id === id)) return null;
        const b = view.screenBox(id);
        if (!b) return null;
        const c = colorOf(p.userId);
        const cx = rect.left + (b.minX + b.maxX) / 2, cy = rect.top + (b.minY + b.maxY) / 2;
        if (!inside(cx, cy)) return null;
        const w = Math.max(34, b.maxX - b.minX + 12), h = Math.max(34, b.maxY - b.minY + 12);
        const round = w <= 40 && h <= 40;
        return (
          <div key={id} className="absolute" data-testid="live-ring" data-name={p.name}
            style={{ left: cx - w / 2, top: cy - h / 2, width: w, height: h, borderRadius: round ? "50%" : 12, boxShadow: `0 0 0 3px ${c}, 0 0 12px 2px ${c}` }}>
            <b className="absolute left-1/2 -translate-x-1/2 -top-5 px-1.5 rounded-full text-[11px] text-zinc-900 whitespace-nowrap" style={{ background: c }}>{p.name}</b>
          </div>
        );
      })}
      {shown.map(([client, p]) => {
        const at = p.at!;
        const age = now - p.when;
        if (at.x == null || at.y == null || age > GONE) return null;
        const q = view.toClient(at.x, at.y);
        if (!q || !inside(q.x, q.y)) return null;
        const c = colorOf(p.userId);
        return (
          <div key={client} className="absolute transition-[left,top,opacity] duration-150 ease-linear" data-testid="live-pointer" data-name={p.name}
            style={{ left: q.x, top: q.y, opacity: age < FADE ? 1 : 1 - (age - FADE) / (GONE - FADE) }}>
            <svg width="18" height="22" viewBox="0 0 18 22" className="block drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"><path d={ARROW} fill={c} stroke="#1b2118" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            <span className="absolute left-3.5 top-4 px-2 py-px rounded-full text-[12px] font-bold text-zinc-900 whitespace-nowrap shadow" style={{ background: c }}>{p.name}</span>
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
      return { x, y, picked: e.selectedId ?? e.group[0] ?? null, view: e.step === "map" || e.step === "export" ? "map" : e.view };
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
    const hidden = () => { if (document.hidden) away(); };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", away);
    document.addEventListener("visibilitychange", hidden);
    const off = useEditor.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId || s.group !== prev.group || s.step !== prev.step || s.view !== prev.view) sendHere(now());
    });
    sendHere(now());
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", away);
      document.removeEventListener("visibilitychange", hidden);
      off();
    };
  }, [on]);
}
