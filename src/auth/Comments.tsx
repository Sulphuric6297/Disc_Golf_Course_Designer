// Comments on the open course: pins on the map (on a spot, or on a tee, basket or other feature,
// moving with it), starting one (the button, C, or right-click), the panel of threads grouped by
// hole, and each thread: beside its pin when the panel is closed, in the panel when it's open,
// a sheet from the bottom on a phone. A thread is new for you until you've read it; it says when
// the feature it's on moved or went since; messages take a few reactions. Everyone on the course
// comments, viewers too, and everyone in it sees changes to the comments as they're made.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { Check, MoreHorizontal, RotateCcw, SmilePlus, X } from "lucide-react";
import { holeLabel } from "../lib/course";
import { getDoc, useCourse, useEditor } from "../state/course";
import { getView } from "../state/view";
import { toast } from "../state/toast";
import { HelpLink, inputCls } from "../components/ui";
import type { CourseDoc, P } from "../types";
import { api, useAuth } from "./api";
import { useServerCourse } from "./courses";
import { useLive } from "./live";
import { colorOf } from "./Presence";

type On = { kind: "hole" | "item"; id: string; x?: number; y?: number };
export interface CommentRow {
  id: string; parentId: string | null; authorId: string | null; author: string | null; authorUsername: string | null; body: string;
  anchor: { x: number; y: number; on?: On } | null;
  version: number; inDraft: boolean; assigneeId: string | null; assignee: string | null; resolvedAt: string | null; resolvedBy: string | null;
  createdAt: string; editedAt: string | null;
  reactions?: { emoji: string; count: number; mine: boolean }[];
}
export type Thread = CommentRow & { replies: CommentRow[]; unread?: boolean };
type Filter = "open" | "mine" | "resolved";

export const useComments = create<{
  courseId: string | null;
  threads: Thread[];
  panel: boolean;
  placing: boolean;
  /** A new comment's spot, waiting for its text. */
  draftAt: { p: P; on?: On } | null;
  /** The thread open (beside its pin, or in the panel). */
  selected: string | null;
  filter: Filter;
  /** Pins hidden (Shift+C). */
  hidden: boolean;
  /** Kept while you write: a new comment's text, and each thread's reply. */
  drafts: Record<string, string>;
  /** Kept for old callers: Resolved is a filter now. */
  showResolved: boolean;
}>(() => ({ courseId: null, threads: [], panel: false, placing: false, draftAt: null, selected: null, filter: "open", hidden: false, drafts: {}, showResolved: false }));
const cs = () => useComments.getState();
const setDraft = (key: string, text: string) => useComments.setState(s => ({ drafts: { ...s.drafts, [key]: text } }));

const base = () => `courses/${useServerCourse.getState().id}/comments`;
export async function loadComments() {
  const id = useServerCourse.getState().id;
  if (!id) { useComments.setState({ courseId: null, threads: [] }); return; }
  const threads = await api<Thread[]>("GET", `courses/${id}/comments`);
  if (useServerCourse.getState().id === id) useComments.setState({ courseId: id, threads });
}
/** A change to the comments, then the list again; a failure said (true when it went through). */
const act = async (fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { toast(`That didn't go through: ${e instanceof Error ? e.message : "try again"}.`, "error"); return false; }
  await loadComments().catch(() => {});
  return true;
};
/** A thread read now (its blue dot goes). */
const markRead = (t: Thread) => {
  if (!t.unread) return;
  useComments.setState(s => ({ threads: s.threads.map(x => (x.id === t.id ? { ...x, unread: false } : x)) }));
  void api("POST", `${base()}/${t.id}/read`).catch(() => {});
};

/** Opens the panel, with a thread in it (from a notice): the map goes to it. */
export const openComments = (threadId?: string) => {
  if (!threadId) { useComments.setState({ panel: true }); return; }
  const t = cs().threads.find(x => x.id === threadId);
  useComments.setState({ panel: true, selected: threadId, ...(t?.resolvedAt ? { filter: "resolved" as Filter } : {}) });
  if (t) setTimeout(() => focusOn(t), 0);
};

/** Where a pin is now: on its feature if it's on one (it moved with it), else where it was put. */
export const pinAt = (t: Thread, doc: CourseDoc): P | null => {
  if (!t.anchor) return null;
  if (t.anchor.on?.kind === "item") {
    const it = doc.items.find(i => i.id === t.anchor!.on!.id) as { x?: number; y?: number } | undefined;
    if (it && typeof it.x === "number" && typeof it.y === "number") return { x: it.x, y: it.y };
  }
  return { x: t.anchor.x, y: t.anchor.y };
};

/** Comments are on the course map: from the Map or Export step, back to it (Design) first. */
const toTheMap = () => { const e = useEditor.getState(); if (e.step === "map" || e.step === "export") e.set({ step: "design" }); };

const focusOn = (t: Thread) => {
  toTheMap();
  const p = pinAt(t, getDoc());
  if (p) getView()?.fitBounds({ minX: p.x - 120, minY: p.y - 120, maxX: p.x + 120, maxY: p.y + 120 }, { minSpan: 240 });
};

/** Starts a comment: on a spot, or on a feature there (from the right-click menu), or placing one. */
export const startComment = (at?: { p: P; on?: On }) => {
  toTheMap();
  useComments.setState(at ? { placing: false, draftAt: at, selected: null } : { placing: true, draftAt: null, selected: null });
};

const KIND: Record<string, string> = { tee: "Tee", basket: "Basket", tree: "Tree", amenity: "Amenity", label: "Label", mando: "Mando", dropzone: "Drop zone", area: "Area", line: "Line", structure: "Building" };
/** What a feature is called in a comment ("Basket", "Tree"). */
export const kindOf = (type: string) => KIND[type] ?? type[0].toUpperCase() + type.slice(1);

/** What a comment is on ("Hole 3", "Basket of hole 3"), from the course as it is. */
const onWhat = (t: Thread, doc: CourseDoc) => {
  const on = t.anchor?.on;
  if (!on) return "";
  if (on.kind === "hole") return doc.holes.some(h => h.id === on.id) ? `Hole ${holeLabel(doc, on.id)}` : "";
  const it = doc.items.find(i => i.id === on.id) as { type: string; holeId?: string } | undefined;
  if (!it) return "";
  return it.holeId && doc.holes.some(h => h.id === it.holeId) ? `${kindOf(it.type)} of hole ${holeLabel(doc, it.holeId)}` : kindOf(it.type);
};

/** The hole a thread belongs to: what it's on, else the hole whose tee or basket is nearest (within
 * 150 ft); none for the rest of the course. */
export const holeOf = (t: Thread, doc: CourseDoc): string | null => {
  const on = t.anchor?.on;
  if (on?.kind === "hole" && doc.holes.some(h => h.id === on.id)) return on.id;
  if (on?.kind === "item") {
    const it = doc.items.find(i => i.id === on.id) as { holeId?: string } | undefined;
    if (it?.holeId && doc.holes.some(h => h.id === it.holeId)) return it.holeId;
  }
  const p = pinAt(t, doc);
  if (!p) return null;
  let best: { id: string; d: number } | null = null;
  for (const it of doc.items as unknown as { type: string; x?: number; y?: number; holeId?: string }[]) {
    if ((it.type !== "tee" && it.type !== "basket") || !it.holeId || typeof it.x !== "number" || typeof it.y !== "number") continue;
    const d = Math.hypot(it.x - p.x, it.y - (p.y));
    if (d < 150 && (!best || d < best.d)) best = { id: it.holeId, d };
  }
  return best && doc.holes.some(h => h.id === best!.id) ? best.id : null;
};

/** What happened to the feature a thread is on since it was written: moved (how far), or gone. */
const changeOf = (t: Thread, doc: CourseDoc): string | null => {
  const on = t.anchor?.on;
  if (on?.kind !== "item" || typeof on.x !== "number" || typeof on.y !== "number") return null;
  const it = doc.items.find(i => i.id === on.id) as { type: string; x?: number; y?: number } | undefined;
  if (!it) return "It was taken out since this comment";
  if (typeof it.x !== "number" || typeof it.y !== "number") return null;
  const d = Math.hypot(it.x - on.x, it.y - on.y);
  if (d < 2) return null;
  const far = doc.units === "m" ? `${Math.round(d * 0.3048)} m` : `${Math.round(d)} ft`;
  return `This ${kindOf(it.type).toLowerCase()} was moved ${far} since this comment`;
};

/** What a click on the map lands on: a tee, basket or other placed feature close by, if any (and
 * where it is, to say later if it moved). */
const landOn = (p: P, doc: CourseDoc): On | undefined => {
  let best: { id: string; d: number; x: number; y: number } | null = null;
  for (const it of doc.items as unknown as { id: string; x?: number; y?: number; type: string }[]) {
    if (typeof it.x !== "number" || typeof it.y !== "number" || it.type === "area" || it.type === "line" || it.type === "structure") continue;
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (d < 25 && (!best || d < best.d)) best = { id: it.id, d, x: it.x, y: it.y };
  }
  return best ? { kind: "item", id: best.id, x: best.x, y: best.y } : undefined;
};

const count = (t: Thread) => 1 + t.replies.length;
/** How long ago, short: "now", "5 min", "2 h", "3 d", then the date. */
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const mineIn = (t: Thread, me: { id: string; username: string } | undefined) => !!me && (
  t.authorId === me.id || t.assigneeId === me.id || t.replies.some(r => r.authorId === me.id) ||
  [t, ...t.replies].some(c => new RegExp(`@${me.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(c.body)));
const lastAt = (t: Thread) => new Date((t.replies[t.replies.length - 1] ?? t).createdAt).getTime();
const filtered = (threads: Thread[], f: Filter, me: { id: string; username: string } | undefined) =>
  threads.filter(t => (f === "resolved" ? !!t.resolvedAt : !t.resolvedAt && (f === "open" || mineIn(t, me))))
    .sort((a, b) => Number(!!b.unread) - Number(!!a.unread) || lastAt(b) - lastAt(a));

const TALK = <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
const PIN = "flex items-center gap-1 h-[26px] min-w-[30px] px-[7px] font-bold text-[11.5px] shadow-[0_2px_6px_rgba(0,0,0,0.6),0_0_0_1.5px_rgba(0,0,0,0.35)]";
const pinTone = (t: Thread) => (t.resolvedAt ? "bg-zinc-300 text-zinc-700" : t.unread ? "bg-sky-400 text-sky-950" : "bg-amber-100 text-amber-950");

// (whether a button is held: pins stay quiet, no previews, while you drag)
let held = false;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => { held = true; }, true);
  for (const ev of ["pointerup", "pointercancel", "blur"]) window.addEventListener(ev, () => { held = false; }, true);
}

/** The pins over the map (grouped when close, standing on a stem in 3D), placing a new one, its
 * box to write in, and a thread beside its pin while the panel is closed. */
export function CommentLayer() {
  const { threads, placing, draftAt, selected, panel, hidden, filter } = useComments();
  const doc = useCourse(s => s.doc);
  const step = useEditor(s => s.step);
  const tilted = useEditor(s => s.view) === "3d";
  const me = useAuth(s => s.session?.user);
  const [hover, setHover] = useState<string | null>(null);
  const [, bump] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const v = getView();
    const el = document.querySelector("[data-testid=plan]");
    const again = () => { setRect(el?.getBoundingClientRect() ?? null); bump(n => n + 1); };
    again();
    const off = v?.onView(again);
    window.addEventListener("resize", again);
    return () => { off?.(); window.removeEventListener("resize", again); };
  }, [panel, step]);
  const view = getView();
  // (not over the Map and Export steps' pages: the map under them is put away)
  if (!view || !rect || step === "map" || step === "export") return null;
  // (none for a spot behind the camera: tilted low in 3D, much of the ground is)
  const at = (p: P, lift = 0) => view.toClient(p.x, p.y, lift) as { x: number; y: number } | null;
  const inside = (q: { x: number; y: number } | null): q is { x: number; y: number } => !!q && q.x >= rect.left && q.x <= rect.right && q.y >= rect.top && q.y <= rect.bottom;
  // The pins shown: open ones (resolved too, on the Resolved filter), where they are on screen
  const shown = threads.filter(t => (filter === "resolved" ? true : !t.resolvedAt) || t.id === selected);
  const spots: { t: Thread; q: { x: number; y: number }; foot: { x: number; y: number } }[] = [];
  for (const t of shown) {
    const p = pinAt(t, doc);
    if (!p) continue;
    const foot = at(p);
    if (!inside(foot)) continue;
    // (in 3D, up on a stem so it stays in sight along the fairway)
    const q = tilted && foot.y - 30 > rect.top ? { x: foot.x, y: foot.y - 30 } : foot;
    spots.push({ t, q, foot });
  }
  // (close together: one bubble with how many, until zoomed in; never the open one)
  const groups: { spots: typeof spots; x: number; y: number }[] = [];
  for (const s of spots) {
    const g = s.t.id === selected ? null : groups.find(x => !x.spots.some(o => o.t.id === selected) && Math.hypot(x.x - s.q.x, x.y - s.q.y) < 30);
    if (g) g.spots.push(s);
    else groups.push({ spots: [s], x: s.q.x, y: s.q.y });
  }
  const quiet = held || !!view.isDragging?.();
  const open = !panel && selected ? spots.find(s => s.t.id === selected) : null;
  // (the pins in a layer of their own just over the map: under the panels, sheets and menus over
  // it, as the rest of the map is; MapViewport's map-pins)
  const plan = document.querySelector("[data-testid=map-pins]");
  const pins = (
    <>
      {!hidden && groups.map(g => {
        if (g.spots.length > 1) {
          const n = g.spots.reduce((k, s) => k + count(s.t), 0);
          const unread = g.spots.some(s => s.t.unread);
          return (
            <button key={g.spots[0].t.id} data-testid="comment-cluster" aria-label={`${g.spots.length} comments here: zoom in`}
              className={`fixed z-20 pointer-events-auto -translate-x-1/2 -translate-y-1/2 rounded-full ${PIN} ${unread ? "bg-sky-400 text-sky-950" : "bg-amber-100 text-amber-950"}`}
              style={{ left: g.x, top: g.y }}
              onClick={() => {
                const ps = g.spots.map(s => pinAt(s.t, doc)!);
                view.fitBounds({ minX: Math.min(...ps.map(p => p.x)) - 40, minY: Math.min(...ps.map(p => p.y)) - 40, maxX: Math.max(...ps.map(p => p.x)) + 40, maxY: Math.max(...ps.map(p => p.y)) + 40 }, { minSpan: 120 });
              }}>
              {TALK}{n}
            </button>
          );
        }
        const { t, q, foot } = g.spots[0];
        const sel = selected === t.id;
        const stem = foot.y - q.y > 2;
        return (
          <div key={t.id}>
            {stem && <div className="fixed z-20 w-[2px] -translate-x-1/2 bg-gradient-to-b from-amber-100 to-amber-100/60 pointer-events-none" style={{ left: q.x, top: q.y, height: foot.y - q.y }} />}
            <button data-testid="comment-pin" aria-label={`Comment by ${t.author ?? "someone"}${t.unread ? ", new" : ""}`}
              className={`fixed z-20 pointer-events-auto ${stem ? "-translate-x-1/2 rounded-[13px]" : "-translate-x-[6px] rounded-[13px_13px_13px_3px]"} -translate-y-full ${PIN} ${pinTone(t)} ${sel ? "outline outline-[2.5px] outline-white outline-offset-2 scale-110 origin-bottom-left" : ""} transition-transform`}
              style={{ left: q.x, top: q.y }}
              onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover(h => (h === t.id ? null : h))}
              onClick={() => { setHover(null); useComments.setState({ selected: sel ? null : t.id }); if (!sel) markRead(t); }}>
              {TALK}{count(t)}
            </button>
            {hover === t.id && !sel && !quiet && <Peek t={t} x={q.x} y={q.y} />}
          </div>
        );
      })}
      {placing && (
        <div className="fixed z-20 pointer-events-auto cursor-crosshair bg-black/25" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} data-testid="comment-placing"
          onContextMenu={e => { e.preventDefault(); useComments.setState({ placing: false }); }}
          onClick={e => {
            const p = view.toPlan(e.clientX, e.clientY) as P | null;
            if (!p) return;
            useComments.setState({ placing: false, draftAt: { p, on: landOn(p, getDoc()) } });
          }}>
          <div className="absolute left-1/2 -translate-x-1/2 top-3 px-3 py-1.5 rounded-lg glass-solid border border-white/[0.12] text-sm text-zinc-100 pointer-events-none">Click where the comment goes · Esc or right-click to stop</div>
        </div>
      )}
    </>
  );
  return (
    <>
      {plan ? createPortal(pins, plan) : pins}
      {/* (its spot out of sight while you type: the box stays, in the middle of the map) */}
      {draftAt && <Composer at={at(draftAt.p) ?? { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }} />}
      {open && <Beside t={open.t} at={open.q} doc={doc} me={me ?? undefined} />}
    </>
  );
}

/** A quick look at a thread, pointing at its pin. */
function Peek({ t, x, y }: { t: Thread; x: number; y: number }) {
  const left = x + 250 > window.innerWidth ? x - 250 : x + 20;
  return (
    <div className="fixed z-30 w-[230px] glass-solid rounded-xl ring-1 ring-white/10 shadow-xl shadow-black/50 px-3 py-2.5 pointer-events-none text-[13px]" style={{ left, top: y - 70 }} data-testid="comment-peek">
      <div className="flex items-center gap-2"><Face id={t.authorId} name={t.author} /><b className="font-semibold text-zinc-100">{t.author ?? "Someone"}</b><span className="text-zinc-500 text-[12px]">· {ago(t.createdAt)}</span></div>
      <p className="mt-1 text-zinc-200 line-clamp-2">{t.body}</p>
      <p className="mt-1 text-[12px] text-zinc-500">{t.replies.length ? `${t.replies.length} repl${t.replies.length === 1 ? "y" : "ies"} · ` : ""}click to open</p>
    </div>
  );
}

/** A thread beside its pin (the panel closed), or a sheet from the bottom on a phone. */
function Beside({ t, at, doc, me }: { t: Thread; at: { x: number; y: number }; doc: CourseDoc; me?: { id: string; username: string } }) {
  const phone = window.innerWidth < 640;
  useEffect(() => { markRead(t); }, [t.id]);
  const style = phone ? undefined : { left: at.x + 440 > window.innerWidth - 8 ? Math.max(8, at.x - 392) : at.x + 56, top: Math.max(64, Math.min(at.y - 60, window.innerHeight - 440)) };
  return (
    <div className={`fixed z-30 glass-solid ring-1 ring-white/10 shadow-2xl shadow-black/50 flex flex-col ${phone ? "left-0 right-0 bottom-0 rounded-t-[20px] max-h-[70dvh]" : "w-[370px] max-h-[420px] rounded-2xl"}`} style={style} role="dialog" aria-label="Comment" data-testid="comment-beside">
      {phone && <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mt-2" />}
      <ThreadView t={t} doc={doc} me={me} close={() => useComments.setState({ selected: null })} />
    </div>
  );
}

/** Someone's face: their initial in their color; a green dot when they're in the course now. */
function Face({ id, name }: { id: string | null; name: string | null }) {
  const here = useLive(s => !!id && s.people.some(p => p.userId === id));
  return (
    <span className="relative w-[22px] h-[22px] rounded-full grid place-items-center text-[10px] font-bold text-zinc-900 shrink-0" style={{ background: id ? colorOf(id) : "#a1a1aa" }} aria-hidden>
      {(name ?? "?").trim()[0]?.toUpperCase()}
      {here && <span className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#161c15]" title="In the course now" />}
    </span>
  );
}

/** Text with its @mentions marked. */
const Body = ({ text }: { text: string }) => (
  <p className="text-[13.5px] text-zinc-200 whitespace-pre-wrap break-words mt-0.5">
    {text.split(/(@[a-zA-Z0-9][a-zA-Z0-9._-]{2,31})/g).map((part, i) => (part.startsWith("@") ? <span key={i} className="rounded px-0.5 bg-sky-400/20 text-sky-300">{part}</span> : part))}
  </p>
);

const REACTIONS = ["👍", "✅", "👀", "❤️"];

/** A box to write in: Enter sends, Shift+Enter is a new line, @ offers the people on the course. */
function Writer({ draftKey, placeholder, onSend, autoFocus = false, label }: { draftKey: string; placeholder: string; onSend: (text: string) => Promise<boolean>; autoFocus?: boolean; label: string }) {
  const text = useComments(s => s.drafts[draftKey] ?? "");
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<{ username: string; displayName: string }[]>([]);
  const [pick, setPick] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  useEffect(() => { void api<{ username: string; displayName: string }[]>("GET", `courses/${useServerCourse.getState().id}/members`).then(setPeople, () => {}); }, []);
  // (an @ being typed: the people it could be)
  const word = /@([a-zA-Z0-9._-]*)$/.exec(text.slice(0, ref.current?.selectionStart ?? text.length))?.[1];
  const offers = word === undefined ? [] : people.filter(p => (p.username + " " + p.displayName).toLowerCase().includes(word.toLowerCase())).slice(0, 5);
  const choose = (u: string) => {
    const at = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, at).replace(/@([a-zA-Z0-9._-]*)$/, `@${u} `);
    setDraft(draftKey, before + text.slice(at));
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(before.length, before.length); });
  };
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onSend(text).finally(() => setBusy(false));
    if (ok) setDraft(draftKey, "");
  };
  return (
    <div className="relative">
      {offers.length > 0 && (
        <ul className="absolute left-0 right-0 bottom-full mb-1 glass-solid rounded-xl ring-1 ring-white/10 py-1 shadow-xl z-10" role="listbox" aria-label="People">
          {offers.map((p, i) => (
            <li key={p.username}><button type="button" className={`w-full text-left px-3 py-1.5 text-[13px] ${i === pick ? "bg-white/[0.1] text-zinc-50" : "text-zinc-200"}`} onMouseDown={e => { e.preventDefault(); choose(p.username); }}>{p.displayName} <span className="text-zinc-500">@{p.username}</span></button></li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 rounded-xl bg-white/[0.07] border border-white/[0.12] px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-sky-400/70">
        <textarea ref={ref} rows={1} className="flex-1 bg-transparent resize-none text-[13.5px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none max-h-32 py-1" placeholder={placeholder} value={text} aria-label={label}
          onChange={e => { setDraft(draftKey, e.target.value); setPick(0); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
          onKeyDown={e => {
            if (offers.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setPick(i => (i + (e.key === "ArrowDown" ? 1 : offers.length - 1)) % offers.length); return; }
            if (offers.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); choose(offers[pick].username); return; }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }} />
        <button type="button" disabled={busy || !text.trim()} aria-label="Send" className="w-7 h-7 rounded-full bg-orange-500 hover:bg-orange-400 text-zinc-950 font-black grid place-items-center disabled:opacity-40 shrink-0" onClick={() => void send()}>↑</button>
      </div>
    </div>
  );
}

/** A new comment's box, by its spot. */
function Composer({ at }: { at: { x: number; y: number } }) {
  const post = async (text: string) => {
    const d = cs().draftAt;
    if (!d) return false;
    try {
      const r = await api<{ id: string }>("POST", base(), { body: text, anchor: { x: d.p.x, y: d.p.y, on: d.on } });
      useComments.setState({ draftAt: null, selected: r.id });
      await loadComments().catch(() => {});
      return true;
    } catch (e) {
      toast(`The comment wasn't posted: ${e instanceof Error ? e.message : "try again"}.`, "error");
      return false;
    }
  };
  const phone = window.innerWidth < 640;
  return (
    <div className={`fixed z-30 glass-solid ring-1 ring-white/10 shadow-2xl shadow-black/50 p-3 ${phone ? "left-0 right-0 bottom-0 rounded-t-[20px]" : "w-80 rounded-2xl"}`} style={phone ? undefined : { left: Math.min(at.x + 16, window.innerWidth - 336), top: Math.max(70, at.y - 40) }} data-testid="comment-composer"
      onKeyDown={e => { if (e.key === "Escape") useComments.setState({ draftAt: null }); }}>
      <div className="flex items-center gap-2 mb-2 text-[12px] text-zinc-400">
        <span className="flex-1">New comment{cs().draftAt?.on ? ` on this ${kindOf(String((getDoc().items.find(i => i.id === cs().draftAt?.on?.id) as { type?: string } | undefined)?.type ?? "spot")).toLowerCase()}` : ""}</span>
        <button aria-label="Cancel" className="text-zinc-400 hover:text-zinc-100" onClick={() => useComments.setState({ draftAt: null })}><X size={15} /></button>
      </div>
      <Writer draftKey="new" placeholder="Write a comment… @ to mention" onSend={post} autoFocus label="Comment" />
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Enter posts · Shift+Enter for a new line</span>
        <button className="px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-400 text-zinc-950 font-semibold text-[12px]" onClick={() => { const t = cs().drafts.new ?? ""; if (t.trim()) void post(t).then(ok => { if (ok) setDraft("new", ""); }); }}>Post</button>
      </div>
    </div>
  );
}

/** The threads, beside the map: Open, For me and Resolved, grouped by hole; the open one shows here. */
export function CommentsPanel() {
  const { threads, selected, panel, filter } = useComments();
  const doc = useCourse(s => s.doc);
  const me = useAuth(s => s.session?.user);
  const list = useMemo(() => filtered(threads, filter, me ?? undefined), [threads, filter, me]);
  const groups = useMemo(() => {
    const m = new Map<string, Thread[]>();
    for (const t of list) { const h = holeOf(t, doc) ?? ""; m.set(h, [...(m.get(h) ?? []), t]); }
    const order = (h: string) => (h ? doc.holes.findIndex(x => x.id === h) : 1e6);
    return [...m].sort((a, b) => order(a[0]) - order(b[0]));
  }, [list, doc]);
  const forMe = threads.filter(t => !t.resolvedAt && t.unread && mineIn(t, me ?? undefined)).length;
  const unread = threads.some(t => t.unread);
  if (!panel) return null;
  const tab = (f: Filter, label: string, extra?: number) => (
    <button className={`px-2.5 py-1 rounded-full text-[12.5px] whitespace-nowrap ${filter === f ? "bg-white/[0.12] text-zinc-50 font-semibold" : "text-zinc-300 hover:text-zinc-50"}`} onClick={() => useComments.setState({ filter: f })} aria-pressed={filter === f} data-testid={`comments-${f}`}>
      {label}{extra ? <span className="ml-1 text-sky-300 font-bold">{extra}</span> : null}
    </button>
  );
  return (
    <aside className="fixed right-0 top-14 bottom-0 z-30 w-[380px] max-w-full glass-solid border-l border-white/[0.08] shadow-2xl flex flex-col" aria-label="Comments" data-testid="comments-panel">
      <div className="flex items-center gap-2 px-4 pt-3">
        <h2 className="font-bold text-zinc-50 flex-1 flex items-center gap-1.5">Comments<HelpLink topic="comments" label="Comments" /></h2>
        <button className="text-[13px] font-semibold text-orange-300 hover:text-orange-200" onClick={() => startComment()} data-testid="add-comment" title="Add a comment (C)">+ Comment <span className="text-zinc-500 font-normal">C</span></button>
        <button aria-label="Close" className="text-zinc-400 hover:text-zinc-50 ml-1" onClick={() => useComments.setState({ panel: false })}><X size={18} /></button>
      </div>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.08]">
        {tab("open", "Open")}{tab("mine", "For me", forMe)}{tab("resolved", "Resolved")}
        {unread && <button className="ml-auto text-[12px] text-zinc-400 hover:text-zinc-100 whitespace-nowrap" onClick={() => void act(() => api("POST", `${base()}/read`))} data-testid="mark-all-read">Mark all read</button>}
      </div>
      <div className="flex-1 overflow-y-auto pb-3" data-testid="threads">
        {list.length === 0 && <p className="text-sm text-zinc-500 px-4 py-3">{threads.length === 0 ? "No comments yet." : filter === "open" ? "No open comments." : filter === "mine" ? "Nothing for you." : "Nothing resolved yet."}</p>}
        {groups.map(([h, ts]) => (
          <section key={h || "course"}>
            <h3 className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[11.5px] font-bold tracking-wide text-zinc-400">
              {h ? <><span className="w-[18px] h-[18px] rounded-full bg-blue-600 text-white grid place-items-center text-[10px]">{holeLabel(doc, h)}</span>HOLE {holeLabel(doc, h)}</> : "THE COURSE"}
              <span className="font-normal">· {ts.length} {filter === "resolved" ? "resolved" : "open"}</span>
            </h3>
            <ol>
              {ts.map(t => (
                <li key={t.id} data-testid="thread" className={selected === t.id ? "mx-2 my-1 rounded-xl bg-white/[0.05] ring-1 ring-white/[0.1]" : ""}>
                  {selected === t.id ? <ThreadView t={t} doc={doc} me={me ?? undefined} inPanel /> : <Row t={t} doc={doc} />}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </aside>
  );
}

/** A thread in the list, closed: who, what it's on, its first line, replies and reactions. */
function Row({ t, doc }: { t: Thread; doc: CourseDoc }) {
  const reacts = t.reactions ?? [];
  return (
    <button className="w-full text-left flex gap-2.5 px-4 py-2 hover:bg-white/[0.04]" data-testid="thread-focus"
      onClick={() => { useComments.setState({ selected: t.id }); markRead(t); focusOn(t); }}>
      <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${t.unread ? "bg-sky-400" : "bg-transparent"}`} aria-label={t.unread ? "New" : undefined} />
      <Face id={t.authorId} name={t.author} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] truncate"><b className="font-semibold text-zinc-100">{t.author ?? "Someone"}</b> <span className="text-zinc-500">· {onWhat(t, doc) || "On the map"} · {ago((t.replies[t.replies.length - 1] ?? t).createdAt)}{t.assignee ? ` · ${t.assignee}'s` : ""}</span></span>
        <span className={`block text-[12.5px] truncate ${t.unread ? "text-zinc-50 font-semibold" : "text-zinc-300"}`}>{t.body}</span>
        {(t.replies.length > 0 || reacts.length > 0) && <span className="block text-[12px] text-zinc-500 mt-0.5">{t.replies.length ? `💬 ${t.replies.length} repl${t.replies.length === 1 ? "y" : "ies"}` : ""}{reacts.length ? `${t.replies.length ? " · " : ""}${reacts.map(r => `${r.emoji} ${r.count}`).join(" ")}` : ""}</span>}
      </span>
    </button>
  );
}

/** A thread, open: its messages, reactions, what changed on the map, a reply, resolve and more. */
function ThreadView({ t, doc, me, inPanel = false, close }: { t: Thread; doc: CourseDoc; me?: { id: string; username: string }; inPanel?: boolean; close?: () => void }) {
  const owner = useServerCourse(s => s.role) === "owner";
  const [more, setMore] = useState(false);
  const [members, setMembers] = useState<{ userId: string; displayName: string }[]>([]);
  useEffect(() => { if (inPanel) markRead(t); }, [t.id, inPanel]);
  useEffect(() => { if (more && !members.length) void api<{ userId: string; displayName: string }[]>("GET", `courses/${useServerCourse.getState().id}/members`).then(setMembers, () => {}); }, [more]);
  const what = onWhat(t, doc);
  const change = changeOf(t, doc);
  // (resolved: closed, unless resolved ones are what's shown)
  const resolve = () => void act(() => api("PATCH", `${base()}/${t.id}`, { resolved: !t.resolvedAt })).then(ok => {
    if (ok && !t.resolvedAt && cs().filter !== "resolved" && cs().selected === t.id) useComments.setState({ selected: null });
  });
  return (
    <div className="flex flex-col min-h-0" data-testid="thread-open">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.08]">
        <button className="text-[13px] font-semibold text-zinc-100 whitespace-nowrap text-left hover:underline" onClick={() => focusOn(t)} title="Show it on the map">{what || "On the map"}</button>
        <span className="text-[12px] text-zinc-500 truncate min-w-0">{t.replies.length ? `· ${t.replies.length} repl${t.replies.length === 1 ? "y" : "ies"}` : ""}{t.resolvedAt ? ` · resolved${t.resolvedBy ? ` by ${t.resolvedBy}` : ""}` : ""}</span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <button className={`w-7 h-7 rounded-lg grid place-items-center bg-white/[0.06] hover:bg-white/[0.12] ${t.resolvedAt ? "text-zinc-300" : "text-emerald-300"}`} title={t.resolvedAt ? "Re-open" : "Resolve"} aria-label={t.resolvedAt ? "Re-open" : "Resolve"} onClick={resolve} data-testid="resolve">
            {t.resolvedAt ? <RotateCcw size={14} /> : <Check size={15} />}
          </button>
          <span className="relative">
            <button className="w-7 h-7 rounded-lg grid place-items-center bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300" aria-label="More" aria-expanded={more} onClick={() => setMore(m => !m)}><MoreHorizontal size={15} /></button>
            {more && (
              <div className="absolute right-0 top-full mt-1 w-56 glass-solid rounded-xl ring-1 ring-white/10 shadow-xl z-20 p-2 text-[13px]" onMouseLeave={() => setMore(false)}>
                <label className="block text-[11.5px] text-zinc-500 px-1">Assigned to</label>
                <select className="w-full mt-1 bg-white/[0.07] rounded-lg px-2 py-1.5 text-zinc-100" value={t.assigneeId ?? ""} aria-label="Assigned to"
                  onChange={e => { setMore(false); void act(() => api("PATCH", `${base()}/${t.id}`, { assigneeId: e.target.value || null })); }}>
                  <option value="">No one</option>
                  {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
                </select>
                {(t.authorId === me?.id || owner) && <button className="w-full text-left mt-2 px-1 py-1 text-red-300 hover:text-red-200" onClick={() => { setMore(false); if (confirm("Delete the whole thread?")) void act(() => api("DELETE", `${base()}/${t.id}`)).then(() => useComments.setState({ selected: null })); }}>Delete the thread</button>}
              </div>
            )}
          </span>
          {(close || inPanel) && <button className="w-7 h-7 rounded-lg grid place-items-center text-zinc-400 hover:text-zinc-100" aria-label="Close" onClick={() => (close ? close() : useComments.setState({ selected: null }))}><X size={15} /></button>}
        </span>
      </div>
      <div className={`overflow-y-auto ${inPanel ? "" : "min-h-0 flex-1"}`}>
        <Message c={t} me={me} owner={owner} first />
        {t.replies.map(r => <Message key={r.id} c={r} me={me} owner={owner} />)}
        {change && (
          <div className="mx-3 my-1.5 px-2.5 py-2 rounded-xl bg-emerald-400/10 border border-emerald-400/25 text-emerald-200 text-[12.5px] flex items-center gap-2" data-testid="comment-change">
            <span className="flex-1">↔ {change}</span>
            {!t.resolvedAt && <button className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-emerald-950 font-bold whitespace-nowrap" onClick={resolve}>Resolve</button>}
          </div>
        )}
      </div>
      <div className="p-2.5">
        {t.resolvedAt
          ? <button className="w-full text-[13px] text-zinc-300 hover:text-zinc-50 py-1.5 rounded-xl bg-white/[0.06]" onClick={resolve}>Re-open to reply</button>
          : <Writer draftKey={t.id} placeholder="Reply… @ to mention" label="Reply" onSend={async text => act(() => api("POST", base(), { body: text, parentId: t.id }))} />}
      </div>
    </div>
  );
}

/** One message: who, when, the text, its reactions; yours to edit or delete. */
function Message({ c, me, owner, first = false }: { c: CommentRow; me?: { id: string }; owner: boolean; first?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(c.body);
  const [picking, setPicking] = useState(false);
  const react = (emoji: string) => { setPicking(false); void act(() => api("POST", `${base()}/${c.id}/react`, { emoji })); };
  return (
    <div className="group flex gap-2.5 px-3 py-2" data-testid="comment-message">
      <Face id={c.authorId} name={c.author} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-[12.5px]">
          <span className="font-semibold text-zinc-100">{c.author ?? "Someone"}</span>
          <span className="text-zinc-500 text-[11.5px]">{ago(c.createdAt)}{c.editedAt ? " · edited" : ""}</span>
          <span className="ml-auto flex items-center gap-2 text-[11.5px] text-zinc-500 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button className="hover:text-zinc-200 flex" aria-label="React" aria-expanded={picking} onClick={() => setPicking(p => !p)}><SmilePlus size={13} /></button>
            {c.authorId === me?.id && !editing && <button className="hover:text-zinc-200" onClick={() => { setEditing(true); setEdit(c.body); }}>Edit</button>}
            {(c.authorId === me?.id || owner) && !first && <button className="hover:text-red-300" onClick={() => { if (confirm("Delete this reply?")) void act(() => api("DELETE", `${base()}/${c.id}`)); }}>Delete</button>}
          </span>
        </div>
        {editing ? (
          <div className="mt-1">
            <textarea className={`${inputCls} min-h-[56px]`} value={edit} onChange={e => setEdit(e.target.value)} aria-label="Edit comment"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void act(() => api("PATCH", `${base()}/${c.id}`, { body: edit })).then(ok => ok && setEditing(false)); } if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }} />
            <div className="flex gap-3 mt-1 text-xs">
              <button className="text-orange-300" onClick={() => void act(() => api("PATCH", `${base()}/${c.id}`, { body: edit })).then(ok => ok && setEditing(false))}>Save</button>
              <button className="text-zinc-400" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : <Body text={c.body} />}
        {picking && (
          <div className="flex gap-0.5 mt-1" role="group" aria-label="Reactions">
            {REACTIONS.map(e => <button key={e} className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-[15px]" onClick={() => react(e)} aria-label={`React ${e}`}>{e}</button>)}
          </div>
        )}
        {(c.reactions ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {(c.reactions ?? []).map(r => (
              <button key={r.emoji} className={`px-1.5 rounded-full border text-[12px] ${r.mine ? "border-sky-400/60 bg-sky-400/15" : "border-white/[0.14] bg-white/[0.05]"}`} onClick={() => react(r.emoji)} aria-pressed={r.mine} title={r.mine ? "Take yours back" : "Same"}>{r.emoji} {r.count}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Keys: Esc stops placing or writing or closes the thread; C starts a comment; Shift+C hides or shows the pins. */
export function useCommentKeys() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (cs().placing || cs().draftAt || (cs().selected && !cs().panel))) {
        e.stopPropagation();
        useComments.setState({ placing: false, draftAt: null, ...(cs().panel ? {} : { selected: null }) });
        return;
      }
      const typing = e.target instanceof HTMLElement && (e.target.closest("input, textarea, select, [contenteditable=true]") !== null);
      if (typing || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "c") return;
      const ed = useEditor.getState();
      if (ed.teeView || ed.flyover) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) { useComments.setState(s => ({ hidden: !s.hidden })); toast(cs().hidden ? "Comment pins hidden (Shift+C to show them)." : "Comment pins shown.", "info"); }
      else startComment();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
}
