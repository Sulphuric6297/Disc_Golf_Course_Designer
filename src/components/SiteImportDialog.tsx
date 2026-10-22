// Finding the park: search for an address or place, frame the course area on the satellite map,
// then bring in the photo, the elevation, the trees and the mapped paths and water.
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPinned, Search, X } from "lucide-react";
import { SitePickerMap } from "./SitePickerMap";
import { fetchPlaceSuggestions, resolveSiteLocation, type PlaceSuggestion } from "../lib/geo/geocode";
import { SITE_MAX_WIDTH_FT, getGeoBounds, selectionFromBounds, type GeoBounds } from "../lib/geo/core";
import type { MapImagerySource } from "../lib/geo/imagery";
import { importSite, type ImportedSite } from "../lib/importSite";
import { getDoc } from "../state/course";
import { Button, Toggle } from "./ui";
import { useLayout } from "./useLayout";

/** The map's first view: the site already brought in (its frame to grow, shrink or move; the
 * design goes along with it), or the whole country. */
const startFrom = () => {
  const site = getDoc().site;
  const b = site.bounds;
  if (!b) return { view: { lat: 39.5, lon: -98.35, zoom: 4, key: 0 }, selection: null, label: "" };
  const lat = (b.north + b.south) / 2, lon = (b.east + b.west) / 2;
  // Zoomed so the frame takes about half of a 1,000 px map
  const widthM = (b.east - b.west) * 111320 * Math.cos((lat * Math.PI) / 180);
  const zoom = Math.max(12, Math.min(18, Math.floor(Math.log2((156543 * Math.cos((lat * Math.PI) / 180) * 500) / Math.max(1, widthM)))));
  return { view: { lat, lon, zoom, key: 1 }, selection: b, label: site.location?.label ?? "" };
};

/** An import under way (whichever dialog started it). */
let importing = false;

export function SiteImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (site: ImportedSite, opts: { trees: boolean; osm: boolean }) => void }) {
  // (open again each time it mounts: React mounts it twice in development, and a flag only ever
  // set to closed left every import there unapplied, stuck short of the end)
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => { open.current = false; };
  }, []);
  const [start] = useState(startFrom);
  const [query, setQuery] = useState(start.label);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [view, setView] = useState(start.view);
  const [selection, setSelection] = useState<GeoBounds | null>(start.selection);
  const [label, setLabel] = useState(start.label);
  const [drawing, setDrawing] = useState(false);
  const [selectView, setSelectView] = useState(0);
  const [imagery, setImagery] = useState<MapImagerySource>("satellite");
  const [trees, setTrees] = useState(true);
  const [lidar, setLidar] = useState(true);
  const [osm, setOsm] = useState(true);
  const [status, setStatus] = useState<{ state: "idle" | "searching" | "loading" | "error"; text: string; progress?: { step: number; of: number; fraction?: number } }>({ state: "idle", text: "" });
  // How long the import has been going (a big site takes a while: it shows it is still working)
  const [started, setStarted] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (status.state !== "loading") return;
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [status.state]);
  const layout = useLayout();
  const timer = useRef(0);
  /** The place just picked (its name in the search box asks for no more suggestions). */
  const picked = useRef(start.label);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const text = query.trim();
    if (text.length < 3 || text === picked.current) { setSuggestions([]); return; }
    timer.current = window.setTimeout(() => {
      fetchPlaceSuggestions(text, { lat: view.lat, lon: view.lon }).then(setSuggestions).catch(() => setSuggestions([]));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [query]);

  const go = async (s?: PlaceSuggestion) => {
    setStatus({ state: "searching", text: "Finding it…" });
    try {
      const text = s ? [s.text, s.detail].filter(Boolean).join(", ") : query;
      const loc = await resolveSiteLocation(text, { suggestion: s, near: { lat: view.lat, lon: view.lon } });
      setSuggestions([]);
      picked.current = loc.label;
      setQuery(loc.label);
      setLabel(loc.label);
      setView({ lat: loc.lat, lon: loc.lon, zoom: 17, key: Date.now() });
      // A sensible first frame for a course: about 1,500 x 1,000 ft around the spot
      setSelection(getGeoBounds(loc, 1500, 1000));
      setStatus({ state: "idle", text: "" });
    } catch (err) {
      setStatus({ state: "error", text: err instanceof Error ? err.message : "Search failed." });
    }
  };

  const dims = selection ? selectionFromBounds(selection, label) : null;
  const tooBig = !!dims && (dims.widthFt > SITE_MAX_WIDTH_FT || dims.heightFt > SITE_MAX_WIDTH_FT);

  const run = async () => {
    // One import at a time (a second click, before the button shows it is busy, starts nothing)
    if (!selection || tooBig || importing) return;
    importing = true;
    setStarted(Date.now());
    setStatus({ state: "loading", text: "Starting…" });
    try {
      const site = await importSite(selectionFromBounds(selection, label || query || "Course site"), { imagery, trees, osm, lidar, onStatus: (text, progress) => setStatus({ state: "loading", text, progress }) });
      // (closed meanwhile: left as it was)
      if (open.current) onImported(site, { trees, osm });
    } catch (err) {
      console.error(err);
      setStatus({ state: "error", text: err instanceof Error ? err.message : "Couldn't bring in the site." });
    } finally {
      importing = false;
    }
  };

  const sizeEl = dims && (
    <div className={`text-sm rounded-lg px-3 py-2 ${tooBig ? "bg-red-900/40 text-red-200" : "bg-white/[0.07] text-zinc-200"}`} data-testid="site-size">
      Area: {Math.round(dims.widthFt).toLocaleString()} × {Math.round(dims.heightFt).toLocaleString()} ft ({((dims.widthFt * dims.heightFt) / 43560).toFixed(1)} acres)
      {tooBig && <div className="text-xs mt-1">Keep it under {SITE_MAX_WIDTH_FT.toLocaleString()} ft each way.</div>}
    </div>
  );
  const options = (
    <>
      <Toggle label="Satellite photo" checked={imagery === "satellite"} onChange={v => setImagery(v ? "satellite" : "streets")} hint={imagery === "satellite" ? "Esri World Imagery" : "OpenStreetMap"} />
      <Toggle label="Trees and ground from LiDAR" checked={lidar} onChange={setLidar} hint="USGS" />
      <Toggle label="Trees found on the photo" checked={trees && imagery === "satellite"} onChange={setTrees} />
      <Toggle label="Paths, water, roads and parking" checked={osm} onChange={setOsm} />
    </>
  );
  const secs = status.state === "loading" && started ? Math.floor((Date.now() - started) / 1000) : 0;
  const p = status.state === "loading" ? status.progress : undefined;
  const statusEl = status.text && (
    <div data-testid="import-status">
      <div className={`text-sm flex items-start gap-2 ${status.state === "error" ? "text-red-300" : "text-zinc-300"}`}>
        {status.state === "loading" || status.state === "searching" ? <Loader2 size={15} className="animate-spin mt-0.5 shrink-0" /> : null}
        <span className="flex-1">{status.text}</span>
        {status.state === "loading" && <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap" data-testid="import-elapsed">{p ? `Step ${p.step} of ${p.of} · ` : ""}{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>}
      </div>
      {p && (
        <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" role="progressbar" aria-label="Import progress" aria-valuenow={Math.round((((p.step - 1) + (p.fraction ?? 0.5)) / p.of) * 100)}>
          <div className="h-full bg-orange-500 transition-[width] duration-500" style={{ width: `${(((p.step - 1) + (p.fraction ?? 0.5)) / p.of) * 100}%` }} />
        </div>
      )}
    </div>
  );
  const mapEl = (
    <SitePickerMap
      imagery={imagery}
      view={view}
      selection={selection}
      drawing={drawing}
      onDrawingChange={setDrawing}
      onSelect={b => setSelection(b)}
      selectViewSignal={selectView}
    />
  );

  if (layout === "phone") {
    // A phone: full screen, the search on top, the map in the middle, what comes in and the
    // button at the bottom (in the thumb's reach)
    return (
      <div className="dg-compact fixed inset-0 z-50 bg-zinc-950 flex flex-col" role="dialog" aria-modal="true" aria-label="Find your course site">
        <div className="flex items-center gap-1 pl-1 pr-3 pt-[max(6px,env(safe-area-inset-top))] pb-1">
          <button className="w-11 h-11 flex items-center justify-center rounded-xl text-zinc-300 active:bg-white/[0.09]" onClick={onClose} aria-label="Close"><X size={22} /></button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-zinc-50 text-[17px] leading-tight">Find your course site</div>
            <div className="text-[13px] text-zinc-400 truncate">Search, then frame the area the holes will use</div>
          </div>
        </div>
        <div className="relative px-3 pb-2 flex gap-2 z-[1100]">
          <div className="relative flex-1 min-w-0">
            <Search size={17} className="absolute left-3 top-3.5 text-zinc-500" />
            <input
              aria-label="Search address"
              className="w-full h-12 bg-white/[0.07] border border-white/[0.12] rounded-xl pl-9 pr-2 text-base focus:outline-none focus:ring-2 focus:ring-sky-400/80"
              placeholder="Park name, address or lat, lon"
              enterKeyHint="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void go(); }}
            />
            {suggestions.length > 0 && (
              <div className="glass-solid absolute z-10 left-0 right-0 mt-1 rounded-[16px] overflow-hidden">
                {suggestions.map((s, i) => (
                  <button key={i} className="block w-full text-left px-3.5 py-3 border-t border-white/[0.12] first:border-t-0 active:bg-white/[0.13]" onClick={() => void go(s)}>
                    <div className="text-[15px] text-zinc-100">{s.text}</div>
                    {s.detail && <div className="text-[13px] text-zinc-400">{s.detail}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="h-12 px-4 rounded-xl bg-white/[0.07] border border-white/[0.12] text-[15px] font-semibold disabled:opacity-40" onClick={() => void go()} disabled={!query.trim() || status.state === "searching"}>Search</button>
        </div>
        <div className="relative flex-1 min-h-0">
          {mapEl}
          <div className="absolute left-2 right-2 top-2 z-[1000] flex gap-2 justify-center pointer-events-none">
            <button className="pointer-events-auto h-10 px-3.5 rounded-full glass border border-white/10 text-[14px] font-semibold shadow-lg active:bg-white/[0.09]" onClick={() => setDrawing(true)}>Draw the area</button>
            <button className="pointer-events-auto h-10 px-3.5 rounded-full glass border border-white/10 text-[14px] font-semibold shadow-lg active:bg-white/[0.09]" onClick={() => setSelectView(v => v + 1)}>Use this view</button>
          </div>
        </div>
        <div className="border-t border-white/10 glass px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-2">
          {dims ? sizeEl : <div className="text-[14px] text-zinc-400 px-1">Search for your park, or pan the map to it and tap Use this view.</div>}
          <details className="group rounded-xl bg-white/[0.07] px-3">
            <summary className="list-none min-h-[44px] flex items-center justify-between text-[14px] text-zinc-200 cursor-pointer">
              <span>Bring in: {[imagery === "satellite" ? "photo" : "street map", "elevation", lidar ? "LiDAR" : null, trees && imagery === "satellite" ? "trees" : null, osm ? "paths and water" : null].filter(Boolean).join(", ")}</span>
              <span className="text-orange-300 font-semibold group-open:hidden">Change</span>
            </summary>
            <div className="pb-2">{options}</div>
          </details>
          {statusEl}
          <button className="h-12 rounded-xl bg-orange-500 text-zinc-950 text-[16px] font-bold disabled:opacity-40 active:bg-orange-600" onClick={() => void run()} disabled={!selection || tooBig || status.state === "loading"} data-testid="import-site">Bring in this site</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-label="Find your course site">
      <div className="glass border border-white/[0.12] rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
          <MapPinned className="text-orange-400" size={20} />
          <div className="flex-1">
            <div className="font-bold text-zinc-50">Find your course site</div>
            <div className="text-xs text-zinc-400">Search for the park, then frame the area the holes will use (drag the corners; Shift+drag draws a new one).</div>
          </div>
          <button className="p-1.5 rounded hover:bg-white/[0.09] text-zinc-400" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 flex min-h-0">
          <div className="w-[320px] border-r border-white/[0.08] p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                aria-label="Search address"
                className="w-full bg-white/[0.07] rounded-lg pl-8 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/80"
                placeholder="Park name, address or lat, lon"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void go(); }}
              />
              {suggestions.length > 0 && (
                <div className="glass-solid absolute z-10 left-0 right-0 mt-1 rounded-[16px] overflow-hidden">
                  {suggestions.map((s, i) => (
                    <button key={i} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/[0.13]" onClick={() => void go(s)}>
                      <div className="text-zinc-100">{s.text}</div>
                      {s.detail && <div className="text-xs text-zinc-400">{s.detail}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => void go()} disabled={!query.trim() || status.state === "searching"}>Search</Button>
            <div className="flex gap-2">
              <Button small onClick={() => setDrawing(true)}>Draw the area</Button>
              <Button small onClick={() => setSelectView(v => v + 1)}>Use this view</Button>
            </div>
            {dims && sizeEl}
            <div className="border-t border-white/[0.08] pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Bring in</div>
              {options}
            </div>
            <div className="mt-auto flex flex-col gap-2">
              {statusEl}
              <Button tone="primary" full onClick={() => void run()} disabled={!selection || tooBig || status.state === "loading"} testid="import-site">Bring in this site</Button>
            </div>
          </div>
          <div className="flex-1 relative">
            {mapEl}
          </div>
        </div>
      </div>
    </div>
  );
}
