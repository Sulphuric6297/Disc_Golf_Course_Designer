// Finding the park: search for an address or place, frame the course area on the satellite map,
// then bring in the photo, the elevation, the trees and the mapped paths and water.
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPinned, Search, X } from "lucide-react";
import { SitePickerMap } from "./SitePickerMap";
import { fetchPlaceSuggestions, resolveSiteLocation, type PlaceSuggestion } from "../lib/geo/geocode";
import { SITE_MAX_WIDTH_FT, getGeoBounds, selectionFromBounds, type GeoBounds } from "../lib/geo/core";
import type { MapImagerySource } from "../lib/geo/imagery";
import { importSite, type ImportedSite } from "../lib/importSite";
import { Button, Toggle } from "./ui";

export function SiteImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (site: ImportedSite, opts: { trees: boolean; osm: boolean }) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [view, setView] = useState({ lat: 39.5, lon: -98.35, zoom: 4, key: 0 });
  const [selection, setSelection] = useState<GeoBounds | null>(null);
  const [label, setLabel] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [selectView, setSelectView] = useState(0);
  const [imagery, setImagery] = useState<MapImagerySource>("satellite");
  const [trees, setTrees] = useState(true);
  const [osm, setOsm] = useState(true);
  const [status, setStatus] = useState<{ state: "idle" | "searching" | "loading" | "error"; text: string }>({ state: "idle", text: "" });
  const timer = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const text = query.trim();
    if (text.length < 3) { setSuggestions([]); return; }
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
    if (!selection || tooBig) return;
    setStatus({ state: "loading", text: "Starting…" });
    try {
      const site = await importSite(selectionFromBounds(selection, label || query || "Course site"), { imagery, trees, osm, onStatus: text => setStatus({ state: "loading", text }) });
      onImported(site, { trees, osm });
    } catch (err) {
      console.error(err);
      setStatus({ state: "error", text: err instanceof Error ? err.message : "Couldn't bring in the site." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-label="Find your course site">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <MapPinned className="text-orange-400" size={20} />
          <div className="flex-1">
            <div className="font-bold text-zinc-50">Find your course site</div>
            <div className="text-xs text-zinc-400">Search for the park, then frame the area the holes will use (drag the corners; Shift+drag draws a new one).</div>
          </div>
          <button className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 flex min-h-0">
          <div className="w-[320px] border-r border-zinc-800 p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                aria-label="Search address"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-2 py-2 text-sm focus:outline-none focus:border-orange-400"
                placeholder="Park name, address or lat, lon"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void go(); }}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                  {suggestions.map((s, i) => (
                    <button key={i} className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-700" onClick={() => void go(s)}>
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
            {dims && (
              <div className={`text-sm rounded-lg px-3 py-2 ${tooBig ? "bg-red-900/40 text-red-200" : "bg-zinc-800 text-zinc-200"}`} data-testid="site-size">
                Area: {Math.round(dims.widthFt).toLocaleString()} × {Math.round(dims.heightFt).toLocaleString()} ft ({((dims.widthFt * dims.heightFt) / 43560).toFixed(1)} acres)
                {tooBig && <div className="text-xs mt-1">Keep it under {SITE_MAX_WIDTH_FT.toLocaleString()} ft each way.</div>}
                {!tooBig && <div className="text-xs text-zinc-400 mt-1">An 18-hole course usually needs 15–40 acres or more.</div>}
              </div>
            )}
            <div className="border-t border-zinc-800 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Bring in</div>
              <Toggle label="Satellite photo" checked={imagery === "satellite"} onChange={v => setImagery(v ? "satellite" : "streets")} hint={imagery === "satellite" ? "Esri World Imagery" : "Street map instead (OpenStreetMap)"} />
              <Toggle label="Trees found on the photo" checked={trees && imagery === "satellite"} onChange={setTrees} hint="Each crown becomes a tree you can move or remove." />
              <Toggle label="Paths, water, roads and parking" checked={osm} onChange={setOsm} hint="From OpenStreetMap, for the map and the safety checks." />
              <div className="text-[11px] text-zinc-500 mt-1">Elevation always comes in: USGS 3DEP lidar in the US, global terrain elsewhere.</div>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              {status.text && (
                <div className={`text-sm flex items-start gap-2 ${status.state === "error" ? "text-red-300" : "text-zinc-300"}`} data-testid="import-status">
                  {status.state === "loading" || status.state === "searching" ? <Loader2 size={15} className="animate-spin mt-0.5 shrink-0" /> : null}
                  {status.text}
                </div>
              )}
              <Button tone="primary" full onClick={() => void run()} disabled={!selection || tooBig || status.state === "loading"} testid="import-site">Bring in this site</Button>
            </div>
          </div>
          <div className="flex-1 relative">
            <SitePickerMap
              imagery={imagery}
              view={view}
              selection={selection}
              drawing={drawing}
              onDrawingChange={setDrawing}
              onSelect={b => setSelection(b)}
              selectViewSignal={selectView}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
