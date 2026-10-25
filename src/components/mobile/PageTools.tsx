// A phone's Map step, the way a design app works on a phone: the page has the screen, and its
// settings are a row of tools along the bottom instead of a sheet pulled up over it. A tool opens
// just that setting in a short panel over the row, and the page shrinks to stay whole above it.
// With a piece picked, the piece's own tools take the row's place (PieceToolbar).
import { SHOW_EVENT } from "../showSetting";
import { Check, FileText, Flag, Handshake, ListTree, Palette, PenLine, Plus, Signpost, Table2, Type, BookOpen, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useEditor } from "../../state/course";
import { DesignPanel } from "../DesignPanel";
import { setToolOpen } from "../pageToolState";
import { OnlyGroup } from "../ui";

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
      {tool && (
        <div className="glass ring-1 ring-white/15 rounded-[22px] mb-1.5 max-h-[38vh] flex flex-col overflow-hidden" data-testid="page-tool-panel" role="region" aria-label={tool.label}>
          <div className="flex items-center gap-2 pl-4 pr-1.5 pt-1.5 shrink-0">
            <span className="flex-1 text-[15px] font-bold text-zinc-50 flex items-center gap-2"><tool.icon size={17} className="text-orange-300" />{tool.label}</span>
            <button className="h-11 shrink-0 flex items-center gap-1 rounded-full px-3.5 bg-orange-500 text-zinc-950 text-[13.5px] font-bold" onClick={() => setOpen(null)} aria-label="Done" data-testid="page-tool-done"><Check size={16} /> Done</button>
          </div>
          <div className="overflow-y-auto dg-scroll min-h-0 -mt-1">
            <OnlyGroup.Provider value={tool.id}><DesignPanel /></OnlyGroup.Provider>
          </div>
        </div>
      )}
      <div role="toolbar" aria-label="Page settings" className="glass ring-1 ring-white/15 rounded-[22px] flex gap-1 p-1 overflow-x-auto dg-noscrollbar touch-pan-x">
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
      </div>
    </div>
  );
}
