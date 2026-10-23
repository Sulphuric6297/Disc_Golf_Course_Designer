// Picking a font for a piece of a tee sign or hole page: the course's own few, then every Google
// font with Latin letters, searchable and sorted by kind, each shown in itself.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { loadFont } from "../lib/fontLoad";
import { pieceFont } from "../lib/pieces";
import type { GoogleFont, FontKind } from "../lib/googleFonts";

const OWN = [{ id: "", label: "The course's lettering" }, { id: "Oswald", label: "Oswald" }, { id: "Inter", label: "Inter" }, { id: "Bitter", label: "Bitter" }, { id: "Script", label: "Kaushan Script" }];
const KINDS: { id: FontKind | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "s", label: "Sans" }, { id: "r", label: "Serif" }, { id: "d", label: "Display" }, { id: "h", label: "Script" }, { id: "m", label: "Mono" }];
const KIND_LABEL: Record<FontKind, string> = { s: "Sans", r: "Serif", d: "Display", h: "Script", m: "Mono" };
const PAGE = 60;

/** The list, fetched the first time a picker opens (it's long). */
let list: Promise<GoogleFont[]> | null = null;
const fonts = () => (list ??= import("../lib/googleFonts").then(m => m.GOOGLE_FONTS));

export function FontPicker({ value, onChange, used = [] }: { value?: string; onChange: (font: string | undefined) => void; used?: string[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<GoogleFont[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<FontKind | "all" | "used">("all");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { if (open) void fonts().then(setAll); }, [open]);
  useEffect(() => { if (value) loadFont(value); }, [value]);
  useEffect(() => setShown(PAGE), [q, kind]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(f => (kind === "all" || (kind === "used" ? used.includes(f.family) : f.kind === kind)) && (!s || f.family.toLowerCase().includes(s)));
  }, [all, q, kind, used]);
  const page = hits.slice(0, shown);
  // (each font shown loads only the letters of its own name)
  useEffect(() => { for (const f of page) loadFont(f.family, { text: f.family, bold: false }); }, [page]);
  const label = OWN.find(o => o.id === (value ?? ""))?.label ?? value ?? "";
  const pick = (f: string | undefined) => { onChange(f); if (f) loadFont(f); setOpen(false); };
  const chip = (on: boolean) => `px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${on ? "bg-orange-400 text-zinc-950" : "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.14]"}`;
  return (
    <div data-testid="font-picker">
      <button className="w-full flex items-center justify-between gap-2 bg-white/[0.08] hover:bg-white/[0.12] rounded-[10px] px-2.5 py-1.5 text-left" aria-expanded={open} aria-label="Font" onClick={() => setOpen(o => !o)}>
        <span className="text-[15px] text-zinc-50 truncate" style={{ fontFamily: pieceFont(value ?? "") }}>{label}</span>
        <ChevronDown size={15} className={`text-zinc-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-[14px] bg-black/30 ring-1 ring-white/10 p-2">
          <label className="flex items-center gap-2 rounded-[10px] bg-white/[0.08] px-2.5 py-1.5">
            <Search size={14} className="text-zinc-400" />
            <input autoFocus className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none" placeholder={`Search ${all.length ? all.length.toLocaleString() : ""} fonts`} value={q} onChange={e => setQ(e.target.value)} aria-label="Search fonts" />
          </label>
          <div className="flex flex-wrap gap-1 mt-2">
            {KINDS.map(k => <button key={k.id} className={chip(kind === k.id)} onClick={() => setKind(k.id)}>{k.label}</button>)}
            {used.length > 0 && <button className={chip(kind === "used")} onClick={() => setKind("used")}>Used</button>}
          </div>
          <div className="mt-2 max-h-[320px] overflow-y-auto -mx-1" role="listbox" aria-label="Fonts">
            {!q && kind === "all" && OWN.map(o => (
              <button key={o.id || "course"} role="option" aria-selected={(value ?? "") === o.id} className={`w-full flex items-center justify-between px-2 py-1.5 rounded-[8px] text-left hover:bg-white/[0.08] ${(value ?? "") === o.id ? "bg-white/[0.1]" : ""}`} onClick={() => pick(o.id || undefined)}>
                <span className="text-[16px] text-zinc-50" style={{ fontFamily: pieceFont(o.id) }}>{o.label}</span>
                <span className="text-[10.5px] text-zinc-500">The app's</span>
              </button>
            ))}
            {page.map(f => (
              <button key={f.family} role="option" aria-selected={value === f.family} className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-[8px] text-left hover:bg-white/[0.08] ${value === f.family ? "bg-white/[0.1]" : ""}`} onClick={() => pick(f.family)} data-testid="font-option">
                <span className="text-[17px] text-zinc-50 truncate" style={{ fontFamily: `'${f.family}', Inter, sans-serif` }}>{f.family}</span>
                <span className="text-[10.5px] text-zinc-500 shrink-0">{KIND_LABEL[f.kind]}</span>
              </button>
            ))}
            {!all.length && <div className="px-2 py-2 text-[12px] text-zinc-500">Loading the fonts…</div>}
            {all.length > 0 && !hits.length && <div className="px-2 py-2 text-[12px] text-zinc-500">No font by that name.</div>}
            {hits.length > shown && <button className="w-full px-2 py-1.5 text-[12px] font-semibold text-orange-300 hover:text-orange-200 text-left" onClick={() => setShown(s => s + PAGE * 2)}>More fonts ({(hits.length - shown).toLocaleString()} left)</button>}
          </div>
        </div>
      )}
    </div>
  );
}
