// A phone's Map step, the way a design app works on a phone: the page has the screen, and its
// settings are a row of tools along the bottom instead of a sheet pulled up over it. A tool opens
// just that setting in a low sheet in the row's place, an X to close it, and the page shrinks to
// stay whole above it: every change shows on the page as it's made. With a piece picked, the
// piece's own tools take the row's place (PieceToolbar).
import { SHOW_EVENT } from "../showSetting";
import { FileText, Flag, Handshake, ListTree, Palette, PenLine, Plus, Signpost, Table2, Type, BookOpen, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { changeDoc, useCourse, useEditor } from "../../state/course";
import { PAPER } from "../../lib/mapSvg";
import { SIGN_SIZES, type SignSize } from "../../lib/teeSign";
import { HOLE_PAGES, type HolePageSize } from "../../lib/holePage";
import { rememberBoard } from "../printouts";
import type { PaperSize } from "../../types";
import { DesignPanel } from "../DesignPanel";
import { InToolSheet, setToolOpen } from "../pageToolState";
import { Field, OnlyGroup, Select } from "../ui";

type Tool = { id: string; label: string; icon: LucideIcon };
type Tab = "general" | "map" | "sign" | "page" | "scorecard";

// (six tools at most, all in a row)
const ADD: Tool = { id: "print-add", label: "Add", icon: Plus };
const LAYERS: Tool = { id: "print-layers", label: "Layers", icon: ListTree };

/** Each printout's settings, a tool each (the panel's Section or Fold it opens), named as the
 * computer's panel names them. */
const TOOLS: Record<Tab, Tool[]> = {
  general: [{ id: "card-style", label: "Lettering and colors", icon: Palette }, { id: "markings", label: "Marks", icon: Flag }, { id: "print-sponsors", label: "Sponsors", icon: Handshake }],
  map: [{ id: "map-style", label: "Style", icon: Palette }, { id: "drawn-on-map", label: "Lines", icon: PenLine }, { id: "fold-title", label: "Lettering", icon: Type }, { id: "fold-paper", label: "Paper", icon: FileText }, ADD, LAYERS],
  sign: [{ id: "sign-settings", label: "Sign", icon: Signpost }, ADD, LAYERS],
  page: [{ id: "page-settings", label: "Page", icon: BookOpen }, ADD, LAYERS],
  scorecard: [{ id: "card-settings", label: "Card", icon: Table2 }, ADD, LAYERS]
};

/** Settings that live inside a tool's panel: the tool they're in. */
const PART_OF: Record<string, string> = { "light-shadow": "map-style", "map-look": "map-style" };

/** The printout's size, first in the tool its other settings are in (the computer has it over the
 * page). */
function SizeOf({ tool }: { tool: string }) {
  const style = useCourse(c => c.doc.style);
  const holes = useCourse(c => c.doc.holes.length);
  const field = (label: string, value: string, options: [string, string][], set: (v: string) => void) => (
    <div className="px-4 pt-2 -mb-1"><Field label="Size"><Select label={label} value={value} onChange={set}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field></div>
  );
  if (tool === "fold-paper") return field("Paper size", style.paper, Object.entries(PAPER).map(([k, p]) => [k, p.label]), v => changeDoc(d => ({ style: { ...d.style, paper: v as PaperSize } })));
  if (tool === "sign-settings" && holes) return field("Tee sign size", style.signSize ?? "18x12", Object.entries(SIGN_SIZES).map(([k, p]) => [k, p.label]), v => { rememberBoard(v as SignSize); changeDoc(d => ({ style: { ...d.style, signSize: v as SignSize } })); });
  if (tool === "page-settings") return field("Hole page size", style.holePageSize ?? "letter", Object.entries(HOLE_PAGES).map(([k, p]) => [k, p.label]), v => changeDoc(d => ({ style: { ...d.style, holePageSize: v as HolePageSize } })));
  return null;
}

export function PageTools() {
  const tab = useEditor(e => e.designTab);
  const [open, setOpen] = useState<string | null>(null);
  const tools = TOOLS[tab];
  // (another printout: its own tools, none open)
  useEffect(() => setOpen(null), [tab]);
  // (the page's zoom buttons stand aside while a tool is open)
  useEffect(() => { setToolOpen(!!open); return () => setToolOpen(false); }, [open]);
  // (Show me, from the help or the View panel: the tool its setting is in, opened)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (typeof d !== "string" || !d.startsWith("page-tool:")) return;
      const id = PART_OF[d.slice(10)] ?? d.slice(10);
      if (TOOLS[useEditor.getState().designTab].some(t => t.id === id)) setOpen(id);
    };
    window.addEventListener(SHOW_EVENT, on);
    return () => window.removeEventListener(SHOW_EVENT, on);
  }, []);
  const tool = tools.find(t => t.id === open);
  return (
    <div className="shrink-0 relative z-30 px-2 pb-1.5" data-testid="page-tools">
      {/* (low: half the screen at most, the page whole above it) */}
      {tool && (
        <div className="glass ring-1 ring-white/15 rounded-[24px] max-h-[min(340px,46dvh)] flex flex-col overflow-hidden animate-[dgrise_200ms_cubic-bezier(0.2,0.9,0.3,1)]" data-testid="page-tool-panel" role="region" aria-label={tool.label}>
          <div className="flex items-center gap-2 pl-4 pr-1.5 pt-1.5 shrink-0">
            <span className="flex-1 text-[16px] font-bold text-zinc-50">{tool.label}</span>
            <button className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-white/[0.1] text-zinc-100 active:bg-white/[0.18] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" onClick={() => setOpen(null)} aria-label="Close" title="Close" data-testid="page-tool-done"><X size={19} /></button>
          </div>
          <div className="overflow-y-auto dg-scroll min-h-0 -mt-1 pb-1">
            <SizeOf tool={tool.id} />
            <InToolSheet.Provider value={true}><OnlyGroup.Provider value={tool.id}><DesignPanel /></OnlyGroup.Provider></InToolSheet.Provider>
          </div>
        </div>
      )}
      {!tool && <div role="toolbar" aria-label="Page settings" className="glass ring-1 ring-white/15 rounded-[22px] flex gap-1 p-1 overflow-x-auto dg-noscrollbar touch-pan-x">
        {tools.map(t => {
          const on = open === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setOpen(on ? null : t.id)}
              aria-pressed={on}
              data-testid={`page-tool-${t.id}`}
              className={`shrink-0 flex-1 min-w-[56px] h-[52px] px-1.5 rounded-[16px] flex flex-col items-center justify-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${on ? "bg-orange-500 text-zinc-950" : "text-zinc-300 active:bg-white/[0.13]"}`}
            >
              <t.icon size={19} />
              <span className="text-[11px] leading-none font-semibold whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
      </div>}
    </div>
  );
}
