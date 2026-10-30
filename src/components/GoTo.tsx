// Search (Ctrl+K): a hole, a step, a tool, a named thing on the map, or any setting or feature in
// the guide, found by typing; picked, it takes you there (a setting: opened and pointed at).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Hash, MapPin, Search, SlidersHorizontal, X, Zap } from "lucide-react";
import { SECTIONS, TOPICS } from "../lib/guide";
import { SERVER } from "../auth/api";
import { showSetting } from "./showSetting";
import { openGettingStarted } from "./GettingStarted";
import { AMENITY_KINDS, AMENITY_ORDER, AREA_KINDS, LINE_KINDS, STRUCTURE_KINDS } from "../constants";
import { holeLabel } from "../lib/course";
import { courseStats } from "../lib/holeStats";
import { fmtDist } from "../lib/units";
import { select } from "../state/actions";
import { useCourse, useEditor } from "../state/course";
import { getView } from "../state/view";
import { STEPS, STEP_ICONS } from "./SidePanel";
import { TOOLS, drawChoice, pickTool } from "./Toolbar";
import { amenityIcon, itemTitle } from "./Inspector";
import type { CourseItem } from "../types";

/** `find`: what typing matches (its name, not its figures); `nums`: a hole's numbers, first when
 * typed; `rank`: ties go to holes and steps first, then tools, then settings. */
type Entry = { key: string; text: string; find: string; sub?: string; keyed?: boolean; icon: ReactNode; run: () => void; nums?: string[]; rank?: number };
/** `keyed`: `sub` is its key (left out on a touch screen). A tool's own icon, at the list's size. */
const SMALL = "flex [&>svg]:w-[15px] [&>svg]:h-[15px] [&>span]:scale-90";

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
  const kind = i.type === "area" ? (i.kind === "field" ? itemTitle(i) : AREA_KINDS[i.kind].label) : i.type === "line" ? LINE_KINDS[i.kind].label : i.type === "structure" ? STRUCTURE_KINDS[i.kind].label : i.type === "amenity" ? AMENITY_KINDS[i.kind].label : "";
  return { name: i.label, kind };
};

export function GoTo({ onClose, onHelp }: { onClose: () => void; onHelp: (topic?: string) => void }) {
  const doc = useCourse(s => s.doc);
  const readOnly = useCourse(s => s.readOnly);
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
        run: () => { toMap(); select(h.id); requestAnimationFrame(() => getView()?.reveal(h.id)); }
      });
    });
    STEPS.forEach((s, i) => {
      const Icon = STEP_ICONS[s.id];
      out.push({ key: `step:${s.id}`, text: s.label, find: s.label, sub: `Step ${i + 1}`, icon: <Icon size={15} />, run: () => useEditor.getState().set({ step: s.id, tool: "select", teeView: null, flyover: false }) });
    });
    // (the tools, with their own icons; none for a course that's only for viewing)
    for (const t of readOnly ? [] : TOOLS) {
      out.push({ key: `tool:${t.id}`, text: t.short, find: `${t.short} ${t.label}`, sub: t.key, keyed: true, icon: <span className={SMALL}>{t.icon}</span>, run: () => { toMap(); pickTool(t); } });
      // (and each thing it has, by its own name: "fence" finds Build's Fence)
      for (const c of t.choices ?? []) out.push({ key: `tool:${t.id}:${c.id}`, text: c.label, find: c.label, sub: t.short, icon: <span className={SMALL}>{c.icon ?? t.icon}</span>, run: () => { toMap(); drawChoice(c); } });
      // (each amenity too: "grill" finds Amenities' Grill)
      if (t.mode === "add-amenity") for (const k of AMENITY_ORDER) {
        const name = AMENITY_KINDS[k].pick ?? AMENITY_KINDS[k].label;
        out.push({ key: `tool:${t.id}:${k}`, text: name, find: `${name} ${AMENITY_KINDS[k].label}`, sub: t.short, icon: <span className={SMALL}>{amenityIcon(k)}</span>, run: () => { toMap(); useEditor.getState().set({ tool: "add-amenity", amenityKind: k }); } });
      }
    }
    for (const i of doc.items) {
      const n = named(i);
      if (n) out.push({ key: `item:${i.id}`, text: n.name, find: `${n.name} ${n.kind}`, sub: n.kind, icon: <MapPin size={15} />, run: () => { toMap(); select(i.id); requestAnimationFrame(() => getView()?.reveal(i.id)); } });
    }
    out.push(
      { key: "act:fit", text: "Whole course", find: "whole course fit", sub: "0", keyed: true, icon: <Zap size={15} />, run: () => { toMap(); requestAnimationFrame(() => getView()?.fitCourse()); } },
      { key: "act:start", text: "Getting started", find: "getting started tutorial tour learn basics checklist show me around new", icon: <BookOpen size={15} />, run: openGettingStarted },
      { key: "act:help", text: "Help guide", find: "help guide manual how to keyboard shortcuts", sub: "?", keyed: true, icon: <BookOpen size={15} />, run: () => onHelp() }
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
  }, [doc, onHelp, readOnly]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all.filter(e => e.key.startsWith("hole:") || e.key.startsWith("step:"));
    const rank = (e: Entry) => +!!e.nums?.includes(t);
    // (every word typed starting a word in it, as Spotlight does: "sign size", "walk width"; never
    // the middle of one: "sign" isn't in "Design")
    const words = t.split(/\s+/).filter(Boolean);
    const has = (e: Entry) => { const f = `${e.text} ${e.find}`.toLowerCase().split(/[^a-z0-9]+/); return words.every(w => f.some(x => x.startsWith(w))); };
    const exact = (e: Entry) => +(e.text.toLowerCase() === t);
    const starts = (e: Entry) => +e.text.toLowerCase().startsWith(t);
    const inTitle = (e: Entry) => { const f = e.text.toLowerCase().split(/[^a-z0-9]+/); return +words.every(w => f.some(x => x.startsWith(w))); };
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
      <div className="w-[520px] max-w-[calc(100%-24px)] glass-solid rounded-2xl shadow-2xl ring-1 ring-white/10 overflow-hidden" role="dialog" aria-label="Search">
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
            aria-label="Search"
            className="flex-1 bg-transparent py-3 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none touch:text-base"
          />
          <kbd className="text-[10px] text-zinc-500 border border-white/[0.12] rounded px-1.5 py-0.5 touch:hidden">Esc</kbd>
          <button className="hidden touch:flex w-11 h-11 -mr-2 shrink-0 items-center justify-center rounded-full text-zinc-400 active:bg-white/[0.09]" aria-label="Close" onClick={onClose} data-testid="goto-close"><X size={18} /></button>
        </div>
        <ul ref={list} className="max-h-[50vh] overflow-y-auto py-1" role="listbox" aria-label="Results">
          {shown.length === 0 && <li className="px-4 py-3 text-sm text-zinc-500" data-testid="goto-empty">Nothing matches that. Try a hole number, a tool or a setting.</li>}
          {shown.map((e, i) => (
            <li key={e.key} role="option" aria-selected={i === at} data-at={i} data-testid="goto-option"
              onMouseMove={() => setAt(i)} onClick={() => run(e)}
              className={`flex items-center gap-2.5 px-3 py-2 touch:py-3 cursor-pointer ${i === at ? "bg-orange-500/15 text-zinc-50" : "text-zinc-300"}`}>
              <span className={i === at ? "text-orange-300" : "text-zinc-500"}>{e.icon}</span>
              <span className="flex-1 min-w-0 truncate text-sm">{e.text}</span>
              {e.sub && <span className={`text-xs text-zinc-500 tabular-nums ${e.keyed ? "touch:hidden" : ""}`}>{e.sub}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
