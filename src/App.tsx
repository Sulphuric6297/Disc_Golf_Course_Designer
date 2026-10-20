// The app: header with the steps, the step panel, the map (2D and 3D in one view), the tools, the
// inspector for the selection, and the dialogs.
import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, MapPinned, Route, Share2, X } from "lucide-react";
import { Header } from "./components/Header";
import { SidePanel } from "./components/SidePanel";
import { MapViewport, getView } from "./components/MapViewport";
import { Toolbar, TOOLS } from "./components/Toolbar";
import { Inspector } from "./components/Inspector";
import { SiteImportDialog } from "./components/SiteImportDialog";
import { TeeViewHud } from "./components/TeeViewHud";
import { MapDesigner } from "./components/MapDesigner";
import { Button } from "./components/ui";
import { useCourse, useEditor, getDoc, changeDoc, updateItem } from "./state/course";
import { deleteSelection, duplicateSelection, nudgeSelection, select } from "./state/actions";
import { makeCopy, openSharedLink, restoreAutosave, startAutosave } from "./state/files";
import { toast, useToasts } from "./state/toast";
import { holeStats } from "./lib/holeStats";
import { shareUrl } from "./lib/share";
import type { ImportedSite } from "./lib/importSite";
import type { CourseItem, P } from "./types";

function Toasts() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);
  const undo = useCourse(s => s.undo);
  return (
    <div className="absolute bottom-[120px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} role="status" className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2.5 shadow-2xl text-sm max-w-[560px] border ${t.tone === "error" ? "bg-red-950 border-red-800 text-red-100" : t.tone === "success" ? "bg-emerald-950 border-emerald-800 text-emerald-50" : "bg-zinc-900 border-zinc-700 text-zinc-100"}`}>
          <span>{t.text}</span>
          {t.undo && <button className="font-bold text-orange-300 hover:text-orange-200" onClick={() => { undo(); dismiss(t.id); }}>Undo</button>}
          {t.action && <button className="font-bold text-orange-300 hover:text-orange-200 whitespace-nowrap" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button aria-label="Dismiss" className="text-zinc-400 hover:text-white" onClick={() => dismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function ShareDialog({ onClose }: { onClose: () => void }) {
  const doc = useCourse(s => s.doc);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { void shareUrl(doc).then(setUrl); }, [doc]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      (document.getElementById("share-url") as HTMLInputElement | null)?.select();
    }
  };
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-label="Share this course" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Share2 size={18} className="text-emerald-400" />
          <h2 className="font-bold text-zinc-50 text-lg flex-1">Share this course</h2>
          <button aria-label="Close" className="text-zinc-400 hover:text-white" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-sm text-zinc-400 mb-3">Anyone with the link sees the course on the map, in 3D and from every tee, and can make their own copy to edit. The whole design is inside the link; the satellite photo and elevation load again on their side.</p>
        <div className="flex gap-2">
          <input id="share-url" aria-label="Share link" readOnly value={url} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200 font-mono" onFocus={e => e.target.select()} />
          <Button tone="primary" onClick={() => void copy()} testid="copy-link"><Copy size={15} /> {copied ? "Copied" : "Copy"}</Button>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
          <span data-testid="share-size">{url ? `${(url.length / 1024).toFixed(1)} KB link` : "Packing the course…"}</span>
          {canShare && url && <button className="text-emerald-300 hover:text-emerald-200 font-semibold" onClick={() => void navigator.share({ title: doc.name, url }).catch(() => {})}>Share with an app…</button>}
        </div>
        {url.length > 60000 && <p className="text-xs text-amber-300 mt-2">This is a long link (lots of trees and shapes). Most browsers and email open it fine; some chat apps shorten long links. Removing trees found on the photo makes it much shorter.</p>}
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["V", "Select and move"], ["H", "New hole (tee, then basket)"], ["T / B", "Another tee / pin for the hole"], ["M / Z", "Mando / drop zone"],
  ["O / L", "Draw an area / a line"], ["R / A / K", "Tree / bench, sign… / label"], ["D", "Measure"],
  ["Enter", "Finish drawing · view from the selected hole's tee"], ["Esc", "Cancel · back to Select · close"], ["Backspace", "Remove the last point drawn"],
  ["Del", "Delete the selection"], ["Ctrl+D", "Duplicate"], ["Arrows", "Nudge 1 ft (Shift: 10 ft) · other holes in the tee view"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["2 / 3", "Top-down / 3D"], ["0 / F", "Whole course / zoom to selection"], ["Q / E / N", "Turn left / right / north up"], ["+ / −", "Zoom"]
];

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-label="Shortcuts and help" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <h2 className="font-bold text-zinc-50 text-lg flex-1">Keyboard shortcuts</h2>
          <button aria-label="Close" className="text-zinc-400 hover:text-white" onClick={onClose}><X size={18} /></button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt><kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 font-mono">{k}</kbd></dt>
              <dd className="text-zinc-300">{v}</dd>
            </div>
          ))}
        </dl>
        <h3 className="font-bold text-zinc-100 mt-5 mb-1">Map navigation</h3>
        <p className="text-sm text-zinc-400">Drag to pan, scroll or pinch to zoom at the cursor, right-drag (or Shift/Ctrl+drag) to turn and tilt, double-click to zoom in.</p>
        <h3 className="font-bold text-zinc-100 mt-4 mb-1">How par is worked out</h3>
        <p className="text-sm text-zinc-400">PDGA Par Guidelines: effective length = the length along the throw line + 3 × the climb from tee to basket (a drop counts the other way), a little longer for doglegs and heavy foliage, then the PDGA's table for the tee color. You can always set par by hand.</p>
        <h3 className="font-bold text-zinc-100 mt-4 mb-1">Credits</h3>
        <p className="text-xs text-zinc-500">Imagery © Esri, Maxar, Earthstar Geographics. Map data © OpenStreetMap contributors. Elevation: USGS 3DEP and AWS Terrain Tiles (Mapzen). Built on the map engine of the Security Camera Planner.</p>
      </div>
    </div>
  );
}

function ContextMenu({ info, onClose }: { info: { clientX: number; clientY: number; itemId: string | null; ground: P | null }; onClose: () => void }) {
  const doc = getDoc();
  const hole = doc.holes.find(h => h.id === info.itemId);
  const item = doc.items.find(i => i.id === info.itemId);
  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  if (!hole && !item) return null;
  const x = Math.min(info.clientX, window.innerWidth - 220), y = Math.min(info.clientY, window.innerHeight - 200);
  const row = "w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800";
  const run = (fn: () => void) => () => { fn(); onClose(); };
  const holeId = hole?.id ?? (item && "holeId" in item ? item.holeId : undefined);
  return (
    <div className="fixed z-50 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1" style={{ left: x, top: y }} role="menu" onPointerDown={e => e.stopPropagation()}>
      {holeId && holeStats(doc, doc.holes.find(h => h.id === holeId)!).complete && (
        <>
          <button className={row} role="menuitem" onClick={run(() => useEditor.getState().set({ teeView: holeId, flyover: false }))}>View from the tee</button>
          <button className={row} role="menuitem" onClick={run(() => useEditor.getState().set({ teeView: holeId, flyover: true }))}>Fly over the hole</button>
        </>
      )}
      {item && (item.type === "area" && item.kind === "water" || item.type === "line" && item.kind !== "ob" && item.kind !== "walk") && (
        <button className={row} role="menuitem" onClick={run(() => updateItem(item.id, { ob: item.ob === true ? undefined : true } as Partial<CourseItem>))}>{item.ob === true ? "Remove the red OB edge" : "Mark as OB (red edge)"}</button>
      )}
      <button className={row} role="menuitem" onClick={run(() => { select(info.itemId); duplicateSelection(); })}>Duplicate</button>
      {item && <button className={row} role="menuitem" onClick={run(() => updateItem(item.id, { locked: !item.locked } as Partial<CourseItem>))}>{item.locked ? "Unlock" : "Lock in place"}</button>}
      <button className={`${row} text-red-300`} role="menuitem" onClick={run(() => { select(info.itemId); deleteSelection(); })}>Delete</button>
    </div>
  );
}

export default function App() {
  const ed = useEditor();
  const doc = useCourse(s => s.doc);
  const [findSite, setFindSite] = useState(false);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState<{ clientX: number; clientY: number; itemId: string | null; ground: P | null } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stop = startAutosave();
    void (async () => {
      if (!(await openSharedLink())) await restoreAutosave();
      setReady(true);
    })();
    const onHash = () => void openSharedLink();
    window.addEventListener("hashchange", onHash);
    return () => { stop(); window.removeEventListener("hashchange", onHash); };
  }, []);

  const onImported = (site: ImportedSite) => {
    changeDoc(d => ({
      canvas: site.canvas,
      gridSize: site.gridSize,
      terrainHeights: site.terrainHeights,
      background: site.background,
      site: site.site,
      groundPaint: {},
      name: d.name === "New Disc Golf Course" && site.site.location ? `${site.site.location.label.split(",")[0]} Disc Golf Course` : d.name,
      items: [
        ...d.items.filter(i => !(i.type === "tree" && i.importSource === "photo") && !((i.type === "area" || i.type === "line") && i.importSource === "osm")),
        ...site.mapped,
        ...site.trees
      ]
    }));
    setFindSite(false);
    useEditor.getState().set({ step: "holes", tool: getDoc().holes.length ? "select" : "add-hole" });
    setTimeout(() => getView()?.fitSite(), 50);
    toast(`Site brought in. ${site.notes.join(" ")}`, "success", false, { label: "View in 3D", run: () => useEditor.getState().set({ view: "3d" }) }, 12000);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Keys go to text fields; sliders, checkboxes and color pickers keep the shortcuts (except
      // the keys a slider uses itself)
      const input = target.tagName === "INPUT" ? (target as HTMLInputElement) : null;
      const textual = !!target.closest?.("textarea,select,[contenteditable=true]") || (!!input && !["range", "checkbox", "radio", "color", "button"].includes(input.type));
      if (textual) return;
      if (input?.type === "range" && /^(Arrow|Home|End|Page)/.test(e.key)) return;
      const s = useEditor.getState();
      const view = getView();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (s.viewOnly) return; if (e.shiftKey) useCourse.getState().redo(); else useCourse.getState().undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); if (!s.viewOnly) useCourse.getState().redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); if (!s.viewOnly) duplicateSelection(); return; }
      if (mod) return;
      if (s.teeView) {
        if (e.key === "Escape") s.set({ teeView: null, flyover: false });
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const d = getDoc();
          const done = d.holes.filter(h => holeStats(d, h).complete);
          const i = done.findIndex(h => h.id === s.teeView);
          const next = done[(i + (e.key === "ArrowLeft" ? -1 : 1) + done.length) % done.length];
          if (next) s.set({ teeView: next.id });
        }
        return;
      }
      if (e.key === "Escape") {
        if (view?.cancelDrawing()) return;
        if (s.tool !== "select") { s.set({ tool: "select" }); return; }
        if (s.selectedId) { select(null); return; }
        return;
      }
      if (e.key === "Enter") {
        if (view?.finishDrawing()) return;
        const d = getDoc();
        const hole = d.holes.find(h => h.id === s.selectedId) ?? d.holes.find(h => h.id === s.activeHoleId);
        if (hole && holeStats(d, hole).complete) s.set({ teeView: hole.id, flyover: false });
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (e.key === "Backspace" && view?.undoPoint()) { e.preventDefault(); return; }
        if (!s.viewOnly && s.selectedId) { e.preventDefault(); deleteSelection(); }
        return;
      }
      if (e.key.startsWith("Arrow") && s.selectedId && !s.viewOnly) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudgeSelection(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
        return;
      }
      if (e.key === "?") { setHelp(h => !h); return; }
      if (e.key === "2") { s.set({ view: "2d" }); return; }
      if (e.key === "3") { s.set({ view: "3d" }); return; }
      if (e.key === "0") { view?.fitCourse(); return; }
      if (e.key === "+" || e.key === "=") { view?.zoomBy(1.4); return; }
      if (e.key === "-" || e.key === "_") { view?.zoomBy(1 / 1.4); return; }
      const k = e.key.toUpperCase();
      if (k === "F") { if (s.selectedId) { const d = getDoc(); if (d.holes.some(h => h.id === s.selectedId)) view?.fitHole(s.selectedId); else view?.reveal(s.selectedId); } return; }
      if (k === "Q") { view?.rotateBy(-30); return; }
      if (k === "E") { view?.rotateBy(30); return; }
      if (k === "N") { view?.resetNorth(); return; }
      if (s.viewOnly) return;
      const tool = TOOLS.find(t => t.key === k);
      if (tool) s.set({ tool: tool.mode });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const empty = useMemo(() => !doc.background && !doc.holes.length && !doc.items.length, [doc]);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      <Header onShare={() => useEditor.getState().set({ shareOpen: true })} onHelp={() => setHelp(true)} />
      {ed.viewOnly && (
        <div className="bg-emerald-900/70 border-b border-emerald-700 px-4 py-2 flex items-center gap-3 text-sm" data-testid="view-only-banner">
          <Eye size={16} className="text-emerald-300" />
          <span className="flex-1 text-emerald-50">You're looking at a shared course: explore the map, the 3D view and the view from each tee. Nothing you do changes it.</span>
          <Button small tone="primary" onClick={() => void makeCopy()} testid="make-copy">Make a copy to edit</Button>
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        <SidePanel onFindSite={() => setFindSite(true)} />
        <main className="flex-1 relative min-w-0">
          <MapViewport onContextMenu={i => !useEditor.getState().viewOnly && setMenu(i)} />
          {ed.step === "design" && !ed.teeView && <MapDesigner />}
          {ed.step !== "design" && <Toolbar />}
          {ed.step !== "design" && <Inspector />}
          {ed.teeView && <TeeViewHud />}
          <Toasts />
          {ready && empty && ed.step === "site" && !ed.viewOnly && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="pointer-events-auto bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-2xl shadow-2xl p-6 w-[440px] text-center" data-testid="welcome">
                <div className="w-12 h-12 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center mx-auto mb-3"><Route size={24} /></div>
                <h2 className="text-xl font-bold text-zinc-50">Design your disc golf course</h2>
                <p className="text-sm text-zinc-400 mt-1.5">Bring in your park's satellite photo, elevation and trees, then lay out tees, baskets, fairways, OB and mandos. Par and lengths follow the terrain; print maps and tee signs, export GPS files, and share a link.</p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button tone="primary" full onClick={() => setFindSite(true)} testid="welcome-find"><MapPinned size={16} /> Find your park</Button>
                  <Button full onClick={() => useEditor.getState().set({ step: "holes", tool: "add-hole" })} testid="welcome-blank">Start on open ground</Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      {findSite && <SiteImportDialog onClose={() => setFindSite(false)} onImported={onImported} />}
      {ed.shareOpen && <ShareDialog onClose={() => useEditor.getState().set({ shareOpen: false })} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {menu && <ContextMenu info={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
