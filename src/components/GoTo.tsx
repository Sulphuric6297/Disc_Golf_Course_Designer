// "Go to" (Ctrl+K): a hole, a step, a tool or a named thing on the map, found by typing.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Hash, MapPin, Search, Wrench, Zap } from "lucide-react";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, STRUCTURE_KINDS } from "../constants";
import { holeLabel } from "../lib/course";
import { courseStats } from "../lib/holeStats";
import { fmtDist } from "../lib/units";
import { select } from "../state/actions";
import { useCourse, useEditor } from "../state/course";
import { getView } from "./MapViewport";
import { STEPS } from "./SidePanel";
import { TOOLS } from "./Toolbar";
import type { CourseItem } from "../types";

/** `find`: what typing matches (its name, not its figures); `nums`: a hole's numbers, first when typed. */
type Entry = { key: string; text: string; find: string; sub?: string; icon: ReactNode; run: () => void; nums?: string[] };

/** The map shows on every step but Design: going to something on it leaves the Design page. */
const toMap = () => {
  const ed = useEditor.getState();
  if (ed.step === "design" || ed.teeView) ed.set({ step: "holes", teeView: null, flyover: false });
};

/** What a named thing on the map is called, and what kind it is. */
const named = (i: CourseItem): { name: string; kind: string } | null => {
  if (i.type === "label") return i.text ? { name: i.text, kind: "Label" } : null;
  if (!("label" in i) || !i.label) return null;
  const kind = i.type === "area" ? AREA_KINDS[i.kind].label : i.type === "line" ? LINE_KINDS[i.kind].label : i.type === "structure" ? STRUCTURE_KINDS[i.kind].label : i.type === "amenity" ? AMENITY_KINDS[i.kind].label : "";
  return { name: i.label, kind };
};

export function GoTo({ onClose, onShare, onHelp }: { onClose: () => void; onShare: () => void; onHelp: () => void }) {
  const doc = useCourse(s => s.doc);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => input.current?.focus(), []);

  const all = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const stats = courseStats(doc);
    doc.holes.forEach((h, k) => {
      const s = stats[k], label = holeLabel(doc, h.id);
      out.push({
        key: `hole:${h.id}`, text: `Hole ${label}${h.name ? ` · ${h.name}` : ""}`, find: `hole ${label} ${h.name ?? ""}`, sub: s.complete ? `${fmtDist(s.length, doc.units)} · Par ${s.par}` : undefined, icon: <Hash size={15} />,
        nums: label.split("/"),
        run: () => { toMap(); select(h.id); requestAnimationFrame(() => getView()?.fitHole(h.id)); }
      });
    });
    STEPS.forEach((s, i) => out.push({ key: `step:${s.id}`, text: s.label, find: s.label, sub: `Step ${i + 1}`, icon: <MapPin size={15} />, run: () => useEditor.getState().set({ step: s.id, tool: "select", teeView: null, flyover: false }) }));
    for (const t of TOOLS) out.push({ key: `tool:${t.mode}`, text: t.short, find: t.short, sub: t.key, icon: <Wrench size={15} />, run: () => { toMap(); useEditor.getState().set({ tool: t.mode }); } });
    for (const i of doc.items) {
      const n = named(i);
      if (n) out.push({ key: `item:${i.id}`, text: n.name, find: `${n.name} ${n.kind}`, sub: n.kind, icon: <MapPin size={15} />, run: () => { toMap(); select(i.id); requestAnimationFrame(() => getView()?.reveal(i.id)); } });
    }
    out.push(
      { key: "act:fit", text: "Whole course", find: "whole course fit", sub: "0", icon: <Zap size={15} />, run: () => { toMap(); requestAnimationFrame(() => getView()?.fitCourse()); } },
      { key: "act:share", text: "Share a link", find: "share a link", icon: <Zap size={15} />, run: onShare },
      { key: "act:help", text: "Keyboard shortcuts", find: "keyboard shortcuts help", sub: "?", icon: <Zap size={15} />, run: onHelp }
    );
    return out;
  }, [doc, onShare, onHelp]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all.filter(e => e.key.startsWith("hole:") || e.key.startsWith("step:"));
    const rank = (e: Entry) => +!!e.nums?.includes(t);
    return all
      .filter(e => rank(e) || e.find.toLowerCase().includes(t))
      .sort((a, b) => rank(b) - rank(a) || +b.text.toLowerCase().startsWith(t) - +a.text.toLowerCase().startsWith(t))
      .slice(0, 40);
  }, [all, q]);

  useEffect(() => setAt(0), [q]);
  useEffect(() => list.current?.querySelector(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" }), [at]);

  const run = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    e.run();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] bg-black/50" onMouseDown={e => e.target === e.currentTarget && onClose()} data-testid="goto">
      <div className="w-[520px] max-w-[calc(100%-24px)] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden" role="dialog" aria-label="Go to">
        <div className="flex items-center gap-2 px-3 border-b border-zinc-800">
          <Search size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={input}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") { e.preventDefault(); onClose(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setAt(a => Math.min(shown.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAt(a => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); run(shown[at]); }
            }}
            placeholder="Hole, step, tool or name"
            aria-label="Go to"
            className="flex-1 bg-transparent py-3 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none touch:text-base"
          />
          <kbd className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 touch:hidden">Esc</kbd>
        </div>
        <ul ref={list} className="max-h-[50vh] overflow-y-auto py-1" role="listbox" aria-label="Results">
          {shown.length === 0 && <li className="px-4 py-3 text-sm text-zinc-500">Nothing found</li>}
          {shown.map((e, i) => (
            <li key={e.key} role="option" aria-selected={i === at} data-at={i} data-testid="goto-option"
              onMouseMove={() => setAt(i)} onClick={() => run(e)}
              className={`flex items-center gap-2.5 px-3 py-2 touch:py-3 cursor-pointer ${i === at ? "bg-orange-500/15 text-zinc-50" : "text-zinc-300"}`}>
              <span className={i === at ? "text-orange-300" : "text-zinc-500"}>{e.icon}</span>
              <span className="flex-1 min-w-0 truncate text-sm">{e.text}</span>
              {e.sub && <span className="text-xs text-zinc-500 tabular-nums">{e.sub}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
