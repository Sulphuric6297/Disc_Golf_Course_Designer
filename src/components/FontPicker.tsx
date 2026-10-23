// Picking a font, the same everywhere a font is picked (the course's lettering, the scorecard's,
// each piece of a sign, page or map): a button showing the font in itself, opening a list to
// search or browse. The fonts this course uses and the ones used lately come first, then the
// app's own, a few that read well on a sign from the tee, then every Google font with Latin
// letters. Hovering a font (or moving through the list with the arrow keys) shows it on the page
// before it's picked; Enter or a click picks it, Esc goes back.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { loadFont } from "../lib/fontLoad";
import { pieceFont } from "../lib/pieces";
import type { FontKind, GoogleFont } from "../lib/googleFonts";

type Row = { head: string } | { id: string; label: string; kind?: FontKind | "own" };
const KINDS: { id: "all" | "signs" | FontKind; label: string }[] = [
  { id: "all", label: "All" }, { id: "signs", label: "Good on signs" }, { id: "s", label: "Sans" }, { id: "r", label: "Serif" },
  { id: "d", label: "Display" }, { id: "h", label: "Script" }, { id: "m", label: "Mono" }
];
const KIND_LABEL: Record<FontKind | "own", string> = { s: "Sans", r: "Serif", d: "Display", h: "Script", m: "Mono", own: "" };
/** Bold, plain letters with open shapes: what reads on a sign from the tee (and a few with character). */
const GOOD_ON_SIGNS = ["Bebas Neue", "Oswald", "Anton", "Barlow Condensed", "Archivo Black", "Montserrat", "Roboto Condensed", "Fjalla One", "League Gothic", "Teko", "Archivo Narrow", "Source Sans 3", "Roboto Slab", "Zilla Slab", "Alfa Slab One", "Bitter", "Bungee", "Black Ops One", "Permanent Marker", "Kaushan Script", "Pacifico", "Lobster"];
/** The app's own (no download). */
const OWN = [{ id: "Oswald", label: "Oswald" }, { id: "Inter", label: "Inter" }, { id: "Bitter", label: "Bitter" }, { id: "Script", label: "Kaushan Script" }];
/** A finger gets taller rows (and the list fills the bottom of the screen). */
const TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const ROW = TOUCH ? 46 : 36, HEAD = 28, VIEW = TOUCH ? 300 : 340;

let list: Promise<GoogleFont[]> | null = null;
const fonts = () => (list ??= import("../lib/googleFonts").then(m => m.GOOGLE_FONTS));
const RECENT_KEY = "dg-recent-fonts";
const recent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } };
const remember = (f: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([f, ...recent().filter(x => x !== f)].slice(0, 8))); } catch { /* private mode */ } };
const face = (f: string) => (f ? pieceFont(f) : undefined);

export function FontPicker({ value, onPick, onPreview, used = [], inherit, label = "Font", compact = false, testid = "font-picker" }: {
  value?: string;
  onPick: (font: string | undefined) => void;
  /** Shows a font on the page while it's hovered (null: back to what it was). */
  onPreview?: (font: string | null) => void;
  used?: string[];
  /** The choice that follows something else ("The course's lettering"), when there is one. */
  inherit?: string;
  label?: string;
  compact?: boolean;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<GoogleFont[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [active, setActive] = useState(-1);
  const [top, setTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // (the list floats over everything, under its button; on a phone, across the bottom)
  const [at, setAt] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => { if (open) void fonts().then(setAll); }, [open]);
  useEffect(() => { if (value) loadFont(value); }, [value]);
  const close = () => { setOpen(false); setQ(""); setActive(-1); onPreview?.(null); };
  // (a click anywhere else closes it)
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !sheet.current?.contains(e.target as Node)) close(); };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  });
  const byName = useMemo(() => new Map(all.map(f => [f.family, f])), [all]);
  const rows: Row[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    const font = (f: string): Row => ({ id: f, label: f, kind: byName.get(f)?.kind });
    if (s || kind !== "all") {
      const pool = kind === "signs" ? GOOD_ON_SIGNS.map(f => byName.get(f)).filter(Boolean) as GoogleFont[] : all.filter(f => kind === "all" || f.kind === kind);
      const own = !s || "the app's".includes(s) ? [] : OWN.filter(o => o.label.toLowerCase().includes(s) && kind === "all");
      return [...own.map(o => ({ id: o.id, label: o.label, kind: "own" as const })), ...pool.filter(f => !s || f.family.toLowerCase().includes(s)).map(f => font(f.family))];
    }
    const out: Row[] = [];
    if (inherit !== undefined) out.push({ id: "", label: inherit, kind: "own" });
    const mine = used.filter(f => f !== value);
    if (mine.length) out.push({ head: "On this course" }, ...mine.map(font));
    const lately = recent().filter(f => f !== value && !mine.includes(f));
    if (lately.length) out.push({ head: "Used lately" }, ...lately.map(font));
    out.push({ head: "The app's own" }, ...OWN.map(o => ({ id: o.id, label: o.label, kind: "own" as const })));
    out.push({ head: "Good on signs" }, ...GOOD_ON_SIGNS.map(font));
    out.push({ head: `Every font (${all.length.toLocaleString()})` }, ...all.map(f => font(f.family)));
    return out;
  }, [q, kind, all, byName, used, value, inherit]);
  // Where each row sits (headings are shorter), and the ones in view
  const offsets = useMemo(() => { let y = 0; return rows.map(r => { const at = y; y += "head" in r ? HEAD : ROW; return at; }); }, [rows]);
  const height = offsets.length ? offsets[offsets.length - 1] + ROW : 0;
  let first = 0;
  while (first < rows.length - 1 && offsets[first + 1] < top - ROW * 4) first++;
  let last = first;
  while (last < rows.length - 1 && offsets[last] < top + VIEW + ROW * 4) last++;
  const shown = rows.slice(first, last + 1);
  // (each font in view loads only the letters of its own name)
  useEffect(() => { for (const r of shown) if ("id" in r && r.kind !== "own") loadFont(r.id, { text: r.label, bold: false }); });
  const picks = rows.map((r, i) => ("id" in r ? i : -1)).filter(i => i >= 0);
  const preview = (i: number) => { setActive(i); const r = rows[i]; if (r && "id" in r) { if (r.id) loadFont(r.id); onPreview?.(r.id || null); } };
  const pick = (r: Row) => { if (!("id" in r)) return; if (r.id) { loadFont(r.id); remember(r.id); } onPick(r.id || undefined); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(rows[active]); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const at = picks.indexOf(active), next = picks[Math.max(0, Math.min(picks.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))] ?? picks[0];
    if (next === undefined) return;
    preview(next);
    const el = scroller.current, y = offsets[next];
    if (el && (y < el.scrollTop || y + ROW > el.scrollTop + VIEW)) el.scrollTop = y - VIEW / 2;
  };
  const current = value ? OWN.find(o => o.id === value)?.label ?? value : inherit ?? "";
  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap ${on ? "bg-orange-400 text-zinc-950" : "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.14]"}`;
  return (
    <div ref={box} className="relative" data-testid={testid}>
      <button className={compact ? "h-8 max-w-[150px] flex items-center gap-1 rounded-full px-2.5 hover:bg-white/[0.12] text-zinc-50" : "w-full flex items-center justify-between gap-2 bg-white/[0.08] hover:bg-white/[0.12] rounded-[10px] px-2.5 py-2 text-left"} aria-expanded={open} aria-label={label} title={label} onClick={e => {
        if (open) return close();
        const r = e.currentTarget.getBoundingClientRect(), w = compact ? 340 : Math.max(280, r.width);
        setAt({ left: Math.max(8, Math.min(window.innerWidth - w - 8, r.left)), top: Math.min(r.bottom + 8, window.innerHeight - 460), width: w });
        setOpen(true);
      }}>
        <span className={`${compact ? "text-[14px]" : "text-[16px]"} text-zinc-50 truncate`} style={{ fontFamily: face(value ?? "") }}>{current}</span>
        <ChevronDown size={14} className={`text-zinc-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div ref={sheet} className={`${TOUCH ? "fixed left-2 right-2 bottom-2" : "fixed"} z-[80] glass rounded-[18px] ring-1 ring-white/15 shadow-2xl p-2.5`} style={TOUCH || !at ? undefined : { left: at.left, top: at.top, width: at.width }} onKeyDown={onKey} role="dialog" aria-label="Fonts">
          <label className="flex items-center gap-2 rounded-[12px] bg-white/[0.1] px-3 py-2">
            <Search size={15} className="text-zinc-400" />
            <input autoFocus={!TOUCH} className="flex-1 min-w-0 bg-transparent text-[14px] text-zinc-50 placeholder:text-zinc-400 focus:outline-none" placeholder="Search fonts" value={q} onChange={e => { setQ(e.target.value); setActive(-1); if (scroller.current) scroller.current.scrollTop = 0; }} aria-label="Search fonts" />
            {q && <button aria-label="Clear the search" className="text-zinc-400 hover:text-zinc-100" onClick={() => setQ("")}><X size={14} /></button>}
          </label>
          <div className="flex gap-1 mt-2 overflow-x-auto pb-0.5 dg-scroll">
            {KINDS.map(k => <button key={k.id} className={chip(kind === k.id)} onClick={() => { setKind(k.id); setActive(-1); if (scroller.current) scroller.current.scrollTop = 0; }}>{k.label}</button>)}
          </div>
          <div ref={scroller} className="mt-2 overflow-y-auto relative" style={{ height: VIEW }} onScroll={e => setTop(e.currentTarget.scrollTop)} onMouseLeave={() => { setActive(-1); onPreview?.(null); }} role="listbox" aria-label="Fonts">
            <div style={{ height: Math.max(height, 1), position: "relative" }}>
              {shown.map((r, k) => {
                const i = first + k, at: CSSProperties = { position: "absolute", top: offsets[i], left: 0, right: 0, height: "head" in r ? HEAD : ROW };
                if ("head" in r) return <div key={`h${i}`} style={at} className="px-2 pt-2.5 text-[10.5px] font-bold tracking-[0.08em] uppercase text-zinc-500">{r.head}</div>;
                const on = (value ?? "") === r.id;
                return (
                  <button key={`${r.id}-${i}`} style={at} role="option" aria-selected={on} data-testid="font-option" onMouseEnter={() => preview(i)} onClick={() => pick(r)}
                    className={`flex items-center gap-2 px-2.5 rounded-[10px] text-left ${active === i ? "bg-white/[0.14]" : on ? "bg-white/[0.08]" : ""}`}>
                    <span className="flex-1 min-w-0 truncate text-[18px] leading-none text-zinc-50" style={{ fontFamily: r.id ? `${face(r.id)}` : undefined }}>{r.label}</span>
                    {r.kind && <span className="text-[10.5px] text-zinc-500 shrink-0">{KIND_LABEL[r.kind]}</span>}
                    {on && <Check size={14} className="text-orange-300 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {!all.length && <div className="absolute inset-x-0 top-20 text-center text-[12px] text-zinc-500">Loading the fonts…</div>}
            {all.length > 0 && !rows.length && <div className="absolute inset-x-0 top-6 text-center text-[13px] text-zinc-400">No font by that name.</div>}
          </div>
          <div className="mt-1.5 px-1 text-[11px] text-zinc-500">{onPreview && !TOUCH ? "Point at a font to see it on the page. Click to use it." : "Tap a font to use it."}</div>
        </div>,
        document.body
      )}
    </div>
  );
}
