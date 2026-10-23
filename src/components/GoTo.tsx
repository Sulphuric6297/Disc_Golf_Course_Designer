// Search (Ctrl+K): a hole, a step, a tool, a named thing on the map, or any setting or feature in
// the guide, found by typing; picked, it takes you there (a setting: opened and pointed at).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Hash, MapPin, Search, SlidersHorizontal, Wrench, Zap } from "lucide-react";
import { SECTIONS, TOPICS } from "../lib/guide";
import { SERVER } from "../auth/api";
import { showSetting } from "./showSetting";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, STRUCTURE_KINDS } from "../constants";
import { holeLabel } from "../lib/course";
import { courseStats } from "../lib/holeStats";
import { fmtDist } from "../lib/units";
import { select } from "../state/actions";
import { useCourse, useEditor } from "../state/course";
import { getView } from "../state/view";
import { STEPS } from "./SidePanel";
import { TOOLS } from "./Toolbar";
import type { CourseItem } from "../types";

/** `find`: what typing matches (its name, not its figures); `nums`: a hole's numbers, first when
 * typed; `rank`: ties go to holes and steps first, then tools, then settings. */
type Entry = { key: string; text: string; find: string; sub?: string; icon: ReactNode; run: () => void; nums?: string[]; rank?: number };

/** Going to something on the map: the Design step, where the map is to work on (the Map and
 * Export steps show the printed page over it). */
const toMap = () => {
  const ed = useEditor.getState();
  if (ed.step === "map" || ed.step === "export" || ed.teeView) ed.set({ step: "design", teeView: null, flyover: false });
};

/** What a named thing on the map is called, and what kind it is. */
const named = (i: CourseItem): { name: string; kind: string } | null => {
  if (i.type === "label") return i.text ? { name: i.text, kind: "Label" } : null;
  if (!("label" in i) || !i.label) return null;
  const kind = i.type === "area" ? AREA_KINDS[i.kind].label : i.type === "line" ? LINE_KINDS[i.kind].label : i.type === "structure" ? STRUCTURE_KINDS[i.kind].label : i.type === "amenity" ? AMENITY_KINDS[i.kind].label : "";
  return { name: i.label, kind };
};

export function GoTo({ onClose, onHelp }: { onClose: () => void; onHelp: (topic?: string) => void }) {
  const doc = useCourse(s => s.doc);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

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
      { key: "act:help", text: "Help guide", find: "help guide manual how to keyboard shortcuts", sub: "?", icon: <BookOpen size={15} />, run: () => onHelp() }
    );
    // Every setting and feature (from the guide): there and pointed at, or its page in the guide
    const section = (id: string) => SECTIONS.find(s => s.id === id)?.title ?? "";
    for (const t of TOPICS) {
      if (t.server !== undefined && t.server !== SERVER) continue;
      out.push({
        key: `set:${t.id}`, text: t.title, find: `${t.title} ${t.words ?? ""} ${t.path ?? ""}`, sub: t.path ?? section(t.section),
        icon: t.where ? <SlidersHorizontal size={15} /> : <BookOpen size={15} />, rank: -1,
        run: () => { if (t.where) void showSetting(t.where); else onHelp(t.id); }
      });
    }
    return out;
  }, [doc, onHelp]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all.filter(e => e.key.startsWith("hole:") || e.key.startsWith("step:"));
    const rank = (e: Entry) => +!!e.nums?.includes(t);
    // (every word typed somewhere in it: "sign size", "walk width")
    const words = t.split(/\s+/).filter(Boolean);
    const has = (e: Entry) => { const f = `${e.text} ${e.find}`.toLowerCase(); return words.every(w => f.includes(w)); };
    const exact = (e: Entry) => +(e.text.toLowerCase() === t);
    const starts = (e: Entry) => +e.text.toLowerCase().startsWith(t);
    const inTitle = (e: Entry) => +words.every(w => e.text.toLowerCase().includes(w));
    return all
      .filter(e => rank(e) || has(e))
      .sort((a, b) => rank(b) - rank(a) || exact(b) - exact(a) || starts(b) - starts(a) || inTitle(b) - inTitle(a) || (b.rank ?? 0) - (a.rank ?? 0))
      .slice(0, 40);
  }, [all, q]);

  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at]);

  const run = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    e.run();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] bg-black/50" onMouseDown={e => e.target === e.currentTarget && onClose()} data-testid="goto">
      <div className="w-[520px] max-w-[calc(100%-24px)] glass-solid rounded-2xl shadow-2xl ring-1 ring-white/10 overflow-hidden" role="dialog" aria-label="Go to">
        <div className="flex items-center gap-2 px-3 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
          <Search size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") { e.preventDefault(); onClose(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setAt(a => Math.min(shown.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAt(a => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); run(shown[at]); }
            }}
            placeholder="Search holes, tools, settings and help"
            aria-label="Go to"
            className="flex-1 bg-transparent py-3 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none touch:text-base"
          />
          <kbd className="text-[10px] text-zinc-500 border border-white/[0.12] rounded px-1.5 py-0.5 touch:hidden">Esc</kbd>
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
