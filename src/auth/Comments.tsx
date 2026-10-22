// Comments on the open course: pins on the map (on a spot, or on a tee, basket or other feature,
// moving with it), placing a new one, and the panel of threads (replies, resolve, assign).
// Everyone on the course comments, viewers too.
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { Check, MessageCircle, MessageSquarePlus, RotateCcw, Trash2, X } from "lucide-react";
import { holeLabel } from "../lib/course";
import { getDoc, useCourse } from "../state/course";
import { getView } from "../state/view";
import { inputCls } from "../components/ui";
import type { CourseDoc, P } from "../types";
import { api, useAuth } from "./api";
import { inDraft, useServerCourse } from "./courses";
import { when } from "./parts";

export interface CommentRow {
  id: string; parentId: string | null; authorId: string | null; author: string | null; authorUsername: string | null; body: string;
  anchor: { x: number; y: number; on?: { kind: "hole" | "item"; id: string } } | null;
  version: number; inDraft: boolean; assigneeId: string | null; assignee: string | null; resolvedAt: string | null; resolvedBy: string | null;
  createdAt: string; editedAt: string | null;
}
export type Thread = CommentRow & { replies: CommentRow[] };

export const useComments = create<{
  courseId: string | null;
  threads: Thread[];
  panel: boolean;
  placing: boolean;
  /** A new comment's spot, waiting for its text. */
  draftAt: { p: P; on?: { kind: "hole" | "item"; id: string } } | null;
  selected: string | null;
  showResolved: boolean;
}>(() => ({ courseId: null, threads: [], panel: false, placing: false, draftAt: null, selected: null, showResolved: false }));
const cs = () => useComments.getState();

const base = () => `courses/${useServerCourse.getState().id}/comments`;
export async function loadComments() {
  const id = useServerCourse.getState().id;
  if (!id) { useComments.setState({ courseId: null, threads: [] }); return; }
  const threads = await api<Thread[]>("GET", `courses/${id}/comments`);
  if (useServerCourse.getState().id === id) useComments.setState({ courseId: id, threads });
}
const act = async (fn: () => Promise<unknown>) => { await fn(); await loadComments(); };

export const openComments = (threadId?: string) => {
  useComments.setState({ panel: true, selected: threadId ?? cs().selected });
  if (threadId) {
    const t = cs().threads.find(x => x.id === threadId);
    if (t && (t.resolvedAt && !cs().showResolved)) useComments.setState({ showResolved: true });
    if (t) setTimeout(() => focusOn(t), 0);
  }
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

const focusOn = (t: Thread) => {
  const p = pinAt(t, getDoc());
  if (p) getView()?.fitBounds({ minX: p.x - 120, minY: p.y - 120, maxX: p.x + 120, maxY: p.y + 120 }, { minSpan: 240 });
};

/** What a comment is on ("Hole 3", "A tee on hole 3"), from the course as it is. */
const onWhat = (t: Thread, doc: CourseDoc) => {
  const on = t.anchor?.on;
  if (!on) return "";
  if (on.kind === "hole") return doc.holes.some(h => h.id === on.id) ? `Hole ${holeLabel(doc, on.id)}` : "";
  const it = doc.items.find(i => i.id === on.id) as { type: string; holeId?: string } | undefined;
  if (!it) return "";
  const kind = it.type === "tee" ? "Tee" : it.type === "basket" ? "Basket" : it.type[0].toUpperCase() + it.type.slice(1);
  return it.holeId && doc.holes.some(h => h.id === it.holeId) ? `${kind} of hole ${holeLabel(doc, it.holeId)}` : kind;
};

/** What a click on the map lands on: a tee, basket or other placed feature close by, if any. */
const landOn = (p: P, doc: CourseDoc): { kind: "hole" | "item"; id: string } | undefined => {
  let best: { id: string; d: number } | null = null;
  for (const it of doc.items as unknown as { id: string; x?: number; y?: number; type: string }[]) {
    if (typeof it.x !== "number" || typeof it.y !== "number" || it.type === "area" || it.type === "line" || it.type === "structure") continue;
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (d < 25 && (!best || d < best.d)) best = { id: it.id, d };
  }
  return best ? { kind: "item", id: best.id } : undefined;
};

/** The pins over the map, and placing a new one. */
export function CommentLayer() {
  const { threads, placing, draftAt, selected, showResolved, panel } = useComments();
  const doc = useCourse(s => s.doc);
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
  }, [panel]);
  const view = getView();
  if (!view || !rect) return null;
  const shown = threads.filter(t => showResolved || !t.resolvedAt);
  const at = (p: P) => view.toClient(p.x, p.y, 0) as { x: number; y: number };
  const inside = (q: { x: number; y: number }) => q.x >= rect.left && q.x <= rect.right && q.y >= rect.top && q.y <= rect.bottom;
  return (
    <>
      {shown.map((t, i) => {
        const p = pinAt(t, doc);
        if (!p) return null;
        const q = at(p);
        if (!inside(q)) return null;
        return (
          <button key={t.id} data-testid="comment-pin" aria-label={`Comment by ${t.author ?? "someone"}`}
            className={`fixed z-20 -translate-x-1/2 -translate-y-full flex items-center justify-center w-7 h-7 rounded-full rounded-bl-none rotate-[-45deg] shadow-lg border-2 ${selected === t.id ? "bg-orange-500 border-white" : t.resolvedAt ? "bg-white/[0.18] border-zinc-300" : "bg-sky-500 border-white"}`}
            // (a little above its spot: what it's on stays there to grab)
            style={{ left: q.x + 8, top: q.y - 12 }}
            onClick={() => { useComments.setState({ selected: t.id }); openComments(t.id); }}>
            <span className="rotate-45 text-[11px] font-bold text-white">{i + 1}</span>
          </button>
        );
      })}
      {placing && (
        <div className="fixed z-20 cursor-crosshair" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} data-testid="comment-placing"
          onClick={e => {
            const p = view.toPlan(e.clientX, e.clientY) as P | null;
            if (!p) return;
            useComments.setState({ placing: false, draftAt: { p, on: landOn(p, getDoc()) } });
          }}>
          <div className="absolute left-1/2 -translate-x-1/2 top-3 px-3 py-1.5 rounded-lg glass border border-white/[0.12] text-sm text-zinc-100 pointer-events-none">Click where the comment goes · Esc to cancel</div>
        </div>
      )}
      {draftAt && <Composer at={at(draftAt.p)} />}
    </>
  );
}

function Composer({ at }: { at: { x: number; y: number } }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const post = async () => {
    const d = cs().draftAt;
    if (!d || !text.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ id: string }>("POST", base(), { body: text, anchor: { x: d.p.x, y: d.p.y, on: d.on }, inDraft: inDraft() && useServerCourse.getState().draft });
      useComments.setState({ draftAt: null, selected: r.id, panel: true });
      await loadComments();
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed z-30 w-72 glass-solid rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 p-3" style={{ left: Math.min(at.x + 12, window.innerWidth - 300), top: Math.max(70, at.y - 40) }} data-testid="comment-composer"
      onKeyDown={e => { if (e.key === "Escape") useComments.setState({ draftAt: null }); }}>
      <textarea ref={ref} className={`${inputCls} min-h-[72px]`} placeholder="Comment (@name to tell someone)" value={text} onChange={e => setText(e.target.value)} aria-label="Comment"
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void post(); }} />
      <div className="flex justify-end gap-2 mt-2">
        <button className="px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.09] rounded-lg" onClick={() => useComments.setState({ draftAt: null })}>Cancel</button>
        <button disabled={busy || !text.trim()} className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-zinc-950 disabled:opacity-50" onClick={() => void post()}>Post</button>
      </div>
    </div>
  );
}

/** The threads, beside the map. */
export function CommentsPanel() {
  const { threads, selected, showResolved, panel } = useComments();
  const doc = useCourse(s => s.doc);
  const me = useAuth(s => s.session?.user);
  const role = useServerCourse(s => s.role);
  const [members, setMembers] = useState<{ userId: string; displayName: string }[]>([]);
  useEffect(() => { if (panel) void api<{ userId: string; displayName: string }[]>("GET", `courses/${useServerCourse.getState().id}/members`).then(setMembers, () => {}); }, [panel]);
  const open = threads.filter(t => !t.resolvedAt);
  const shown = useMemo(() => threads.filter(t => showResolved || !t.resolvedAt), [threads, showResolved]);
  if (!panel) return null;
  return (
    <aside className="fixed right-0 top-14 bottom-0 z-30 w-[360px] max-w-full glass-solid border-l border-white/[0.08] shadow-2xl flex flex-col" aria-label="Comments" data-testid="comments-panel">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
        <h2 className="font-bold text-zinc-50 flex-1">Comments <span className="text-zinc-500 font-normal">{open.length}</span></h2>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400"><input type="checkbox" checked={showResolved} onChange={e => useComments.setState({ showResolved: e.target.checked })} /> Resolved</label>
        <button aria-label="Close" className="text-zinc-400 hover:text-zinc-50" onClick={() => useComments.setState({ panel: false })}><X size={18} /></button>
      </div>
      <button className="mx-4 mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950" onClick={() => useComments.setState({ placing: true, draftAt: null })} data-testid="add-comment">
        <MessageSquarePlus size={15} /> Add a comment
      </button>
      <ol className="flex-1 overflow-y-auto p-3 space-y-2" data-testid="threads">
        {shown.length === 0 && <li className="text-sm text-zinc-500 px-1">{threads.length ? "No open comments." : "No comments yet."}</li>}
        {shown.map((t, i) => (
          <li key={t.id} data-testid="thread" className={`rounded-xl border ${selected === t.id ? "border-orange-400/70 bg-white/[0.07]" : "border-white/[0.08] glass"} ${t.resolvedAt ? "opacity-70" : ""}`}>
            <ThreadView t={t} n={i + 1} doc={doc} me={me?.id ?? null} owner={role === "owner"} members={members} />
          </li>
        ))}
      </ol>
    </aside>
  );
}

function ThreadView({ t, n, doc, me, owner, members }: { t: Thread; n: number; doc: CourseDoc; me: string | null; owner: boolean; members: { userId: string; displayName: string }[] }) {
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState("");
  const what = onWhat(t, doc);
  const one = (c: CommentRow, first: boolean) => (
    <div className={first ? "" : "mt-2 pl-3 border-l border-white/[0.12]"}>
      <div className="flex items-baseline gap-2 text-[12px]">
        <span className="font-semibold text-zinc-100">{c.author ?? "Someone"}</span>
        <span className="text-zinc-500">{when(c.createdAt)}{c.editedAt ? " · edited" : ""}{c.inDraft ? " · in a draft" : ""}</span>
      </div>
      {editing === c.id ? (
        <div className="mt-1">
          <textarea className={`${inputCls} min-h-[56px]`} value={edit} onChange={e => setEdit(e.target.value)} aria-label="Edit comment" />
          <div className="flex gap-2 mt-1 text-xs">
            <button className="text-orange-300" onClick={() => void act(() => api("PATCH", `${base()}/${c.id}`, { body: edit })).then(() => setEditing(null))}>Save</button>
            <button className="text-zinc-400" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words mt-0.5">{c.body}</p>}
      <div className="flex gap-3 mt-1 text-[11px] text-zinc-500">
        {c.authorId === me && editing !== c.id && <button className="hover:text-zinc-200" onClick={() => { setEditing(c.id); setEdit(c.body); }}>Edit</button>}
        {(c.authorId === me || owner) && <button className="hover:text-red-300 inline-flex items-center gap-0.5" onClick={() => { if (confirm(first ? "Delete the whole thread?" : "Delete this reply?")) void act(() => api("DELETE", `${base()}/${c.id}`)); }}><Trash2 size={11} /> Delete</button>}
      </div>
    </div>
  );
  return (
    <div className="p-3">
      <button className="w-full text-left flex items-center gap-2 mb-1.5" onClick={() => { useComments.setState({ selected: t.id }); focusOn(t); }} data-testid="thread-focus">
        <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{n}</span>
        <span className="text-[12px] text-zinc-400 flex-1 truncate">{what || "On the map"}{t.resolvedAt ? ` · resolved${t.resolvedBy ? ` by ${t.resolvedBy}` : ""}` : ""}</span>
        <MessageCircle size={13} className="text-zinc-500" />
      </button>
      {one(t, true)}
      {t.replies.map(r => <div key={r.id}>{one(r, false)}</div>)}
      <div className="mt-2 flex items-center gap-2">
        <input className={`${inputCls} flex-1`} placeholder="Reply" value={reply} onChange={e => setReply(e.target.value)} aria-label="Reply"
          onKeyDown={e => { if (e.key === "Enter" && reply.trim()) { const b = reply; setReply(""); void act(() => api("POST", base(), { body: b, parentId: t.id })); } }} />
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs">
        <button className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-50" onClick={() => void act(() => api("PATCH", `${base()}/${t.id}`, { resolved: !t.resolvedAt }))} data-testid="resolve">
          {t.resolvedAt ? <><RotateCcw size={12} /> Re-open</> : <><Check size={12} /> Resolve</>}
        </button>
        <select className="bg-white/[0.07] rounded-lg px-1.5 py-0.5 text-xs text-zinc-200 max-w-[150px]" value={t.assigneeId ?? ""} aria-label="Assigned to"
          onChange={e => void act(() => api("PATCH", `${base()}/${t.id}`, { assigneeId: e.target.value || null }))}>
          <option value="">Not assigned</option>
          {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Esc cancels placing or writing a comment. */
export function useCommentKeys() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && (cs().placing || cs().draftAt)) { e.stopPropagation(); useComments.setState({ placing: false, draftAt: null }); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
}
