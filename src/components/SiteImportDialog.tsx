// Finding the park: search for an address or place, frame the course area on the satellite map,
// then bring in the photo, the elevation, the trees and the mapped paths, roads, water and buildings.
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPinned, Search, X } from "lucide-react";
import { SitePickerMap } from "./SitePickerMap";
import { fetchPlaceSuggestions, resolveSiteLocation, type PlaceSuggestion } from "../lib/geo/geocode";
import { SITE_MAX_WIDTH_FT, SITE_MIN_WIDTH_FT, getGeoBounds, selectionFromBounds, type GeoBounds } from "../lib/geo/core";
import type { MapImagerySource } from "../lib/geo/imagery";
import { importSite, type ImportedSite } from "../lib/importSite";
import { fmtArea, fmtDist } from "../lib/units";
import { getDoc } from "../state/course";
import { Button, HelpLink, Segmented, Toggle } from "./ui";
import { useLayout, useTouch } from "./useLayout";

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
  // (a site in already: bringing it in again replaces what came last time)
  const [again] = useState(() => !!getDoc().site.bounds);
  const [units] = useState(() => getDoc().units);
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
  // (closing while a site comes in: asked first, in the dialog)
  const [stopping, setStopping] = useState(false);
  // How long the import has been going (a big site takes a while: it shows it is still working)
  const [started, setStarted] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (status.state !== "loading") { setStopping(false); return; }
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [status.state]);
  const layout = useLayout();
  const touch = useTouch();
  const timer = useRef(0);
  /** This dialog's own import under way (a second click starts nothing). */
  const running = useRef(false);
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
    if (!s && !query.trim()) return;
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
      const said = err instanceof Error ? err.message : "Search failed.";
      // (what to try next)
      setStatus({ state: "error", text: said.startsWith("Couldn't find") ? `${said} Try its name and town, its lat, lon or a map link.` : said });
    }
  };

  // Closed (X or Esc): asked first while a site is coming in, as what came so far is left out;
  // Esc while drawing stops drawing first
  const close = () => {
    if (status.state === "loading") { setStopping(true); return; }
    onClose();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      if (stopping) setStopping(false);
      else if (drawing) setDrawing(false);
      else close();
    };
    // (before the editor's own Esc, which would let go of what's picked behind the dialog)
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  });

  const dims = selection ? selectionFromBounds(selection, label) : null;
  const tooBig = !!dims && (dims.widthFt > SITE_MAX_WIDTH_FT || dims.heightFt > SITE_MAX_WIDTH_FT);
  const tooSmall = () => setStatus({ state: "error", text: `Too small: at least ${fmtDist(SITE_MIN_WIDTH_FT, units)} each way.` });
  const onSelect = (b: GeoBounds) => {
    setSelection(b);
    setStatus(s => (s.state === "error" ? { state: "idle", text: "" } : s));
  };

  const run = async () => {
    // One import at a time (a second click, before the button shows it is busy, starts nothing)
    if (!selection || tooBig || running.current) return;
    // (one closed while it was coming in is still finishing)
    if (importing) { setStatus({ state: "error", text: "The site from before is still coming in. Try again in a moment." }); return; }
    importing = true;
    running.current = true;
    setStarted(Date.now());
    setStatus({ state: "loading", text: "Starting…" });
    try {
      // (the place's name only when one was picked: a frame drawn by hand has none)
      const site = await importSite(selectionFromBounds(selection, label), { imagery, trees, osm, lidar, onStatus: (text, progress) => setStatus({ state: "loading", text, progress }) });
      // (closed meanwhile: left as it was)
      if (open.current) onImported(site, { trees, osm });
    } catch (err) {
      console.error(err);
      setStatus({ state: "error", text: err instanceof Error ? err.message : "Couldn't bring in the site." });
    } finally {
      importing = false;
      running.current = false;
    }
  };

  const sizeEl = dims && (
    <div className={`text-sm rounded-lg px-3 py-2 ${tooBig ? "bg-red-900/40 text-red-200" : "bg-white/[0.07] text-zinc-200"}`} data-testid="site-size">
      Area: {fmtDist(dims.widthFt, units, false)} × {fmtDist(dims.heightFt, units)} ({fmtArea(dims.widthFt * dims.heightFt, units)})
      {tooBig && <div className="text-xs mt-1">Keep it under {fmtDist(SITE_MAX_WIDTH_FT, units)} each way.</div>}
    </div>
  );
  const photo = imagery === "satellite";
  const options = (
    <>
      <div className="py-1 touch:py-1.5">
        <div className="text-xs touch:text-[13px] text-zinc-400 mb-1">Under the map</div>
        <Segmented label="Under the map" value={imagery} onChange={setImagery} options={[{ value: "satellite", label: "Satellite photo" }, { value: "streets", label: "Street map" }]} />
      </div>
      <Toggle label="Real trees and ground (aerial survey)" checked={lidar} onChange={setLidar} hint="USGS LiDAR, in the US where it's been flown" />
      {/* (a street map has no trees to spot: off until the photo's back) */}
      <fieldset disabled={!photo} className={`border-0 p-0 m-0 min-w-0 ${photo ? "" : "opacity-50"}`}>
        <Toggle label="Trees spotted on the satellite photo" checked={trees && photo} onChange={setTrees} hint={photo ? "Used where there's no aerial survey" : "Needs the satellite photo."} />
      </fieldset>
      <Toggle label="Paths, roads, water and buildings" checked={osm} onChange={setOsm} hint="OpenStreetMap" />
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
  // (a site in already: what bringing it in again does, in short; the guide has the rest)
  const againEl = again && status.state !== "loading" && <p className="text-[12.5px] text-amber-200/90 flex items-center gap-1.5" data-testid="import-again">Replaces what came in last time <HelpLink topic="re-import" label="Bring it in again" /></p>;
  const goLabel = again ? "Bring it in again" : "Bring in this site";
  // (drawing: said how, the way this screen does it)
  const drawHint = drawing && <p className="text-[12.5px] text-orange-200" data-testid="draw-hint">{touch ? "Drag across the map to draw the area" : "Drag across the map to draw the area · Esc stops"}</p>;
  // (asked in the dialog, over its foot, before an import under way is dropped)
  const stopEl = stopping && (
    <div className="glass-solid ring-1 ring-white/15 rounded-[18px] p-3.5 shadow-2xl" role="alertdialog" aria-label="Stop bringing in this site?" data-testid="import-stop">
      <p className="text-[14px] font-semibold text-zinc-50">Stop bringing in this site?</p>
      <p className="text-[13px] text-zinc-300 mt-0.5">None of it is kept.</p>
      <div className="flex justify-end gap-2 mt-2.5">
        <button className="h-9 touch:h-11 px-3.5 rounded-full text-[13.5px] font-semibold text-zinc-200 hover:bg-white/[0.08]" onClick={() => setStopping(false)} data-testid="import-keep-going">Keep going</button>
        <button className="h-9 touch:h-11 px-3.5 rounded-full text-[13.5px] font-semibold bg-red-500/90 hover:bg-red-500 text-white" onClick={onClose} data-testid="import-stop-yes">Stop</button>
      </div>
    </div>
  );
  const mapEl = (
    <SitePickerMap
      imagery={imagery}
      view={view}
      selection={selection}
      drawing={drawing}
      onDrawingChange={setDrawing}
      onSelect={onSelect}
      onTooSmall={tooSmall}
      selectViewSignal={selectView}
      units={units}
    />
  );
  const suggestionList = (big: boolean) => suggestions.length > 0 && (
    <div className="glass-solid absolute z-10 left-0 right-0 mt-1 rounded-[16px] overflow-hidden">
      {suggestions.map((s, i) => (
        <button key={i} className={big ? "block w-full text-left px-3.5 py-3 border-t border-white/[0.12] first:border-t-0 active:bg-white/[0.13]" : "block w-full text-left px-3 py-2 text-sm hover:bg-white/[0.13]"} onClick={() => void go(s)}>
          <div className={big ? "text-[15px] text-zinc-100" : "text-zinc-100"}>{s.text}</div>
          {s.detail && <div className={big ? "text-[13px] text-zinc-400" : "text-xs text-zinc-400"}>{s.detail}</div>}
        </button>
      ))}
    </div>
  );
  // (the search button inside the field, at its end)
  const searchBtn = (big: boolean) => (
    <button className={`absolute right-1 top-1/2 -translate-y-1/2 ${big ? "w-10 h-10" : "w-8 h-8"} rounded-[10px] flex items-center justify-center text-zinc-300 hover:text-zinc-50 hover:bg-white/[0.1] active:bg-white/[0.13] disabled:opacity-40`} onClick={() => void go()} disabled={!query.trim() || status.state === "searching"} aria-label="Search" title="Search" data-testid="site-search">
      {status.state === "searching" ? <Loader2 size={big ? 19 : 16} className="animate-spin" /> : <Search size={big ? 19 : 16} />}
    </button>
  );
  const placeholder = "Park name, address, lat, lon or a map link";

  if (layout === "phone") {
    // A phone: full screen, the search on top, the map in the middle, what comes in and the
    // button at the bottom (in the thumb's reach)
    return (
      <div className="dg-compact fixed inset-0 z-50 bg-zinc-950 flex flex-col" role="dialog" aria-modal="true" aria-label="Find your park">
        <div className="flex items-center gap-1 pl-1 pr-3 pt-[max(6px,env(safe-area-inset-top))] pb-1">
          <button className="w-11 h-11 flex items-center justify-center rounded-xl text-zinc-300 active:bg-white/[0.09]" onClick={close} aria-label="Close"><X size={22} /></button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-zinc-50 text-[17px] leading-tight">Find your park</div>
            <div className="text-[13px] text-zinc-400 truncate">Search, then frame the area the holes will use</div>
          </div>
        </div>
        <div className="relative px-3 pb-2 z-[1100]">
          <div className="relative">
            <input
              aria-label="Search address"
              className="w-full h-12 bg-white/[0.07] border border-white/[0.12] rounded-xl pl-3.5 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-sky-400/80"
              placeholder={placeholder}
              enterKeyHint="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void go(); }}
            />
            {searchBtn(true)}
            {suggestionList(true)}
          </div>
        </div>
        <div className="relative flex-1 min-h-0">
          {mapEl}
          <div className="absolute left-2 right-2 top-2 z-[1000] flex gap-2 justify-center pointer-events-none">
            <button className={`pointer-events-auto h-10 px-3.5 rounded-full border text-[14px] font-semibold shadow-lg ${drawing ? "bg-orange-500 text-zinc-950 border-orange-400" : "glass border-white/10 active:bg-white/[0.09]"}`} aria-pressed={drawing} onClick={() => setDrawing(d => !d)}>Draw the area</button>
            <button className="pointer-events-auto h-10 px-3.5 rounded-full glass border border-white/10 text-[14px] font-semibold shadow-lg active:bg-white/[0.09]" onClick={() => setSelectView(v => v + 1)}>Use this view</button>
          </div>
        </div>
        <div className="relative border-t border-white/10 glass px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-2">
          {stopEl && <div className="absolute left-3 right-3 bottom-full mb-2 z-[1100]">{stopEl}</div>}
          {drawHint}
          {dims ? sizeEl : <div className="text-[14px] text-zinc-400 px-1">Search for your park, or move the map to it and tap Use this view.</div>}
          <details className="group rounded-xl bg-white/[0.07] px-3">
            <summary className="list-none min-h-[44px] flex items-center justify-between text-[14px] text-zinc-200 cursor-pointer">
              <span>Bring in: {[photo ? "photo" : "street map", "elevation", lidar ? "measured trees" : null, trees && photo ? "trees from the photo" : null, osm ? "paths, roads, water and buildings" : null].filter(Boolean).join(", ")}</span>
              <span className="text-orange-300 font-semibold group-open:hidden">Change</span>
            </summary>
            <div className="pb-2">{options}</div>
          </details>
          {statusEl}
          {againEl}
          <button className="h-12 rounded-xl bg-orange-500 text-zinc-950 text-[16px] font-bold disabled:opacity-40 active:bg-orange-600" onClick={() => void run()} disabled={!selection || tooBig || status.state === "loading"} data-testid="import-site">{goLabel}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-label="Find your park">
      <div className="glass border border-white/[0.12] rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
          <MapPinned className="text-orange-400" size={20} />
          <div className="flex-1">
            <div className="font-bold text-zinc-50">Find your park</div>
            <div className="text-xs text-zinc-400">{touch ? "Search for the park, then frame the area the holes will use (drag the corners, or Draw the area for a new one)." : "Search for the park, then frame the area the holes will use (drag the corners; Shift+drag draws a new one)."}</div>
          </div>
          <button className="p-1.5 touch:w-11 touch:h-11 touch:flex touch:items-center touch:justify-center rounded hover:bg-white/[0.09] text-zinc-400" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 flex min-h-0">
          <div className="relative w-[320px] border-r border-white/[0.08] p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="relative">
              <input
                aria-label="Search address"
                className="w-full bg-white/[0.07] rounded-lg pl-2.5 pr-10 py-2 touch:py-2.5 text-sm touch:text-base focus:outline-none focus:ring-2 focus:ring-sky-400/80"
                placeholder={placeholder}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void go(); }}
              />
              {searchBtn(touch)}
              {suggestionList(false)}
            </div>
            <div className="flex gap-2">
              <Button small tone={drawing ? "primary" : "default"} onClick={() => setDrawing(d => !d)}>Draw the area</Button>
              <Button small onClick={() => setSelectView(v => v + 1)}>Use this view</Button>
            </div>
            {drawHint}
            {dims && sizeEl}
            <div className="border-t border-white/[0.08] pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Bring in</div>
              {options}
            </div>
            <div className="mt-auto flex flex-col gap-2">
              {statusEl}
              {againEl}
              {stopEl}
              <Button tone="primary" full onClick={() => void run()} disabled={!selection || tooBig || status.state === "loading"} testid="import-site">{goLabel}</Button>
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
