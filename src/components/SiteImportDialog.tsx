// Finding the park, on one map from start to finish: search (disc golf courses and parks first),
// the park framed by its own outline, what this spot will bring (each a switch, with where it
// comes from), then the map filling in as each part lands, with a checklist of how each went.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Droplets, Flag, Image as ImageIcon, Loader2, MapPin, Mountain, Pencil, Route, Search, Target, TreeDeciduous, Trees, X } from "lucide-react";
import { SitePickerMap, type Arrived } from "./SitePickerMap";
import { fetchPlaceSuggestions, resolveSiteLocation, type PlaceSuggestion } from "../lib/geo/geocode";
import { SITE_MAX_WIDTH_FT, SITE_MIN_WIDTH_FT, getGeoBounds, isAbort, selectionFromBounds, type GeoBounds } from "../lib/geo/core";
import type { MapImagerySource } from "../lib/geo/imagery";
import { findSiteOutline, type SiteOutline } from "../lib/geo/parks";
import { lidarCoverage } from "../lib/geo/lidarFetch";
import { inUS } from "../lib/geo/usgov";
import { photoChoices, photoDateText, photoFeetPerPx, type PhotoChoice } from "../lib/geo/photoSources";
import { importSite, type ImportedSite, type ImportLayer, type SourceId, type SourceStatus } from "../lib/importSite";
import { fmtArea, fmtDist } from "../lib/units";
import { getDoc } from "../state/course";
import type { CourseItem } from "../types";
import { HelpLink } from "./ui";
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

/** The north-up box round a frame turned `deg` clockwise: what's brought in (north stays north; the
 * course map is turned to match). */
const turnedBox = (b: GeoBounds, deg: number): GeoBounds => {
  if (!deg) return b;
  const lat0 = (b.north + b.south) / 2, lon0 = (b.east + b.west) / 2;
  const mx = 111320 * Math.cos((lat0 * Math.PI) / 180), my = 110540, a = (deg * Math.PI) / 180;
  const hw = ((b.east - b.west) * mx) / 2, hh = ((b.north - b.south) * my) / 2;
  const ex = Math.abs(hw * Math.cos(a)) + Math.abs(hh * Math.sin(a)), ey = Math.abs(hw * Math.sin(a)) + Math.abs(hh * Math.cos(a));
  return { north: lat0 + ey / my, south: lat0 - ey / my, east: lon0 + ex / mx, west: lon0 - ex / mx };
};

/** A frame round an outline, a little past its edges, kept within the size a site can be. */
const frameAround = (b: GeoBounds): GeoBounds => {
  const lat = (b.north + b.south) / 2;
  const padLat = (b.north - b.south) * 0.08, padLon = (b.east - b.west) * 0.08;
  let f = { north: b.north + padLat, south: b.south - padLat, east: b.east + padLon, west: b.west - padLon };
  const d = selectionFromBounds(f, "");
  const k = Math.min(1, SITE_MAX_WIDTH_FT / Math.max(d.widthFt, d.heightFt));
  if (k < 1) {
    const lon = (b.east + b.west) / 2, hLat = ((f.north - f.south) / 2) * k, hLon = ((f.east - f.west) / 2) * k;
    f = { north: lat + hLat, south: lat - hLat, east: lon + hLon, west: lon - hLon };
  }
  return f;
};

const ROW_NAMES: Record<SourceId, string> = { photo: "Photo", elevation: "Ground", lidar: "Measured trees", osm: "Paths, roads and more", buildings: "Buildings from the air", photoTrees: "Trees from the photo", gov: "Creeks, wetlands and buildings" };
const ORDER: SourceId[] = ["photo", "elevation", "lidar", "osm", "buildings", "photoTrees"];

/** How each kind of thing that came in is drawn on the map while the rest is still coming. */
const drawnAs = (i: CourseItem): { area?: string; line?: string; weight?: number } => {
  if (i.type === "area") return { area: i.kind === "water" ? "#2b8fd6" : i.kind === "woods" ? "#2f5d34" : i.kind === "parking" ? "#6b7280" : i.kind === "building" ? "#a8a29e" : i.kind === "field" ? "#6aa84f" : i.kind === "sand" ? "#d9c48f" : "#8fb86a" };
  if (i.type === "structure") return { area: i.kind === "shelter" ? "#4f7356" : "#a8653f" };
  if (i.type === "line") return { line: i.kind === "road" ? "#9ca3af" : i.kind === "stream" ? "#2b8fd6" : i.kind === "path" ? "#e8d2a6" : i.kind === "fence" ? "#78716c" : i.kind === "hedge" ? "#3f6b35" : "#d6d3d1", weight: i.kind === "road" ? 5 : 3 };
  return {};
};

export function SiteImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (site: ImportedSite, opts: { trees: boolean; osm: boolean; course?: boolean; turn?: number }) => void }) {
  // (open again each time it mounts: React mounts it twice in development, and a flag only ever
  // set to closed left every import there unapplied, stuck short of the end)
  const open = useRef(true);
  /** Stops the import under way (closed, or Stop). */
  const stopper = useRef<AbortController | null>(null);
  useEffect(() => {
    open.current = true;
    return () => { open.current = false; stopper.current?.abort(); };
  }, []);
  const [start] = useState(startFrom);
  // (a site in already: bringing it in again replaces what came last time)
  const [again] = useState(() => !!getDoc().site.bounds);
  const [units] = useState(() => getDoc().units);
  const [query, setQuery] = useState(start.label);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [view] = useState(start.view);
  const [selection, setSelection] = useState<GeoBounds | null>(start.selection);
  const [label, setLabel] = useState(start.label);
  const [drawing, setDrawing] = useState(false);
  // (the frame turned, degrees clockwise from north: the course map is turned to match)
  const [angle, setAngle] = useState(() => Math.round(getDoc().style.rotation ?? 0));
  const [outline, setOutline] = useState<SiteOutline | null>(null);
  const [fit, setFit] = useState<{ bounds: GeoBounds; key: number } | null>(null);
  const [imagery, setImagery] = useState<MapImagerySource>("satellite");
  const [trees, setTrees] = useState(true);
  const [lidar, setLidar] = useState(true);
  // (with measured trees: the ones the survey missed, from the photo)
  const [fill, setFill] = useState(true);
  const [osm, setOsm] = useState(true);
  const [gov, setGov] = useState(true);
  const [course, setCourse] = useState(true);
  // What this spot has (looked up as the frame settles)
  const [here, setHere] = useState<{ photo?: PhotoChoice; survey?: { year: number; covered: "full" | "partial" | "none" } } | null>(null);
  const [status, setStatus] = useState<{ state: "idle" | "searching" | "loading" | "error"; text: string; progress?: { fraction: number } }>({ state: "idle", text: "" });
  const [sources, setSources] = useState<Partial<Record<SourceId, SourceStatus>>>({});
  const [arrived, setArrived] = useState<Arrived | null>(null);
  // (closing while a site comes in: asked first, in the dialog)
  const [stopping, setStopping] = useState(false);
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
  const running = useRef(false);
  /** The place just picked (its name in the search box asks for no more suggestions). */
  const picked = useRef(start.label);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const text = query.trim();
    if (text.length < 3 || text === picked.current) { setSuggestions([]); return; }
    // (one ask a pause in the typing, near the frame when there is one; an older one let go of)
    const stop = new AbortController();
    const near = selection ? { lat: (selection.north + selection.south) / 2, lon: (selection.east + selection.west) / 2 } : { lat: view.lat, lon: view.lon };
    timer.current = window.setTimeout(() => {
      fetchPlaceSuggestions(text, near, { signal: stop.signal }).then(s => { if (!stop.signal.aborted) setSuggestions(s); }).catch(() => { if (!stop.signal.aborted) setSuggestions([]); });
    }, 300);
    return () => { window.clearTimeout(timer.current); stop.abort(); };
  }, [query]);

  // What this spot will get: the newest survey over it, and the best photo (quick lookups only)
  useEffect(() => {
    if (!selection) { setHere(null); return; }
    const stop = new AbortController();
    // (each lookup given a few seconds at most: the switches settle either way)
    const within = <T,>(p: Promise<T>, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>(r => window.setTimeout(() => r(fallback), 6500))]);
    const t = window.setTimeout(() => {
      void Promise.all([
        within(lidarCoverage(selection), null),
        within(photoChoices(selection, { signal: stop.signal, timeoutMs: 6000 }), [] as PhotoChoice[])
      ]).then(([cov, photos]) => {
        if (stop.signal.aborted) return;
        setHere({ photo: photos[0], survey: cov ? { year: cov.surveys[0]?.year ?? 0, covered: cov.covered } : undefined });
      });
    }, 400);
    return () => { window.clearTimeout(t); stop.abort(); };
  }, [selection]);

  const go = async (s?: PlaceSuggestion) => {
    if (!s && !query.trim()) return;
    setStatus({ state: "searching", text: "Finding it…" });
    try {
      const text = s ? [s.text, s.detail].filter(Boolean).join(", ") : query;
      const loc = await resolveSiteLocation(text, { suggestion: s, near: { lat: view.lat, lon: view.lon } });
      setSuggestions([]);
      // (coordinates or a map link: no name, the search box keeps what was typed)
      picked.current = loc.label || text.trim();
      setQuery(loc.label || text.trim());
      setLabel(loc.label);
      setOutline(null);
      // A first frame round the spot, then round the park's own outline once it's found
      const first = getGeoBounds(loc, 1500, 1000);
      setSelection(first);
      setFit({ bounds: first, key: Date.now() });
      setStatus({ state: "idle", text: "" });
      const o = await findSiteOutline({ lat: loc.lat, lon: loc.lon, osmId: s?.osmId, name: (s?.text ?? loc.label).split(",")[0] || undefined }).catch(() => null);
      if (o && o.outline.length >= 3) {
        const f = frameAround(o.bounds);
        setOutline(o);
        setSelection(f);
        setFit({ bounds: f, key: Date.now() });
      }
    } catch (err) {
      const said = err instanceof Error ? err.message : "Search failed.";
      setStatus({ state: "error", text: said.startsWith("Couldn't find") ? `${said} Try its name and town, its lat, lon or a map link.` : said });
    }
  };

  // Where you are (the map's locate button): framed as a search is
  const locate = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) { setStatus({ state: "error", text: "This browser can't tell where you are." }); return; }
    setStatus({ state: "searching", text: "Finding where you are…" });
    navigator.geolocation.getCurrentPosition(
      p => {
        const loc = { lat: p.coords.latitude, lon: p.coords.longitude, label: "" };
        setLabel("");
        const f = getGeoBounds(loc, 1500, 1000);
        setSelection(f);
        setFit({ bounds: f, key: Date.now() });
        setStatus({ state: "idle", text: "" });
      },
      e => setStatus({ state: "error", text: e.code === e.PERMISSION_DENIED ? "Location is off for this site. Allow it in the browser's settings." : "Couldn't tell where you are. Try again, or search." }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

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
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  });

  const dims = selection ? selectionFromBounds(selection, label) : null;
  // (what's brought in: the north-up box round the frame as turned)
  const box = selection ? selectionFromBounds(turnedBox(selection, angle), label) : null;
  const tooBig = !!box && (box.widthFt > SITE_MAX_WIDTH_FT || box.heightFt > SITE_MAX_WIDTH_FT);
  const tooSmall = () => setStatus({ state: "error", text: `Too small: at least ${fmtDist(SITE_MIN_WIDTH_FT, units)} each way.` });
  const onSelect = (b: GeoBounds) => {
    setSelection(b);
    setStatus(s => (s.state === "error" ? { state: "idle", text: "" } : s));
  };

  // What has come in, put on the map as it lands
  const landed = useRef<Arrived | null>(null);
  const onLayer = (l: ImportLayer) => {
    if (l.source === "frame") { landed.current = { bounds: l.bounds, width: l.canvas.width, height: l.canvas.height, areas: [], lines: [], trees: [] }; }
    const a = landed.current;
    if (!a) return;
    if (l.source === "photo") a.photo = l.background;
    const items = l.source === "osm" || l.source === "buildings" ? l.items : l.source === "photoTrees" ? [...l.areas, ...l.trees] : [];
    for (const i of items) {
      const how = drawnAs(i);
      if (how.area && "points" in i) a.areas.push({ points: i.points, color: how.area, opacity: how.area === "#2f5d34" ? 0.45 : 0.6 });
      else if (how.line && "points" in i) a.lines.push({ points: i.points, color: how.line, weight: how.weight });
      else if (i.type === "tree") a.trees.push({ x: i.x, y: i.y, r: (i.width ?? 20) / 2 });
    }
    // (measured trees: a few thousand at most, so the map stays quick)
    if (l.source === "lidar") { const step = Math.max(1, Math.ceil(l.trees.length / 4000)); for (let k = 0; k < l.trees.length; k += step) a.trees.push({ x: l.trees[k][0], y: l.trees[k][1], r: l.trees[k][3] }); }
    setArrived({ ...a });
  };

  const run = async () => {
    if (!selection || tooBig || running.current) return;
    if (importing) { setStatus({ state: "error", text: "The site from before is still coming in. Try again in a moment." }); return; }
    importing = true;
    running.current = true;
    const stop = new AbortController();
    stopper.current = stop;
    setStarted(Date.now());
    setSources({});
    landed.current = null;
    setArrived(null);
    setStatus({ state: "loading", text: "Starting…" });
    try {
      const site = await importSite(selectionFromBounds(turnedBox(selection, angle), label), { imagery, trees, surveyed: !!survey, osm, lidar, summerFill: fill, gov, signal: stop.signal, onLayer, onProgress: p => {
        (window as { __dgImportProgress?: unknown }).__dgImportProgress = p;
        if (!stop.signal.aborted) { setStatus({ state: "loading", text: p.text, progress: { fraction: p.fraction } }); setSources({ ...p.sources }); }
      } });
      if (open.current && !stop.signal.aborted) onImported(site, { trees, osm, course: course && !!outline?.course?.holes, turn: angle });
    } catch (err) {
      if (isAbort(err) || stop.signal.aborted) return;
      console.error(err);
      setStatus({ state: "error", text: err instanceof Error ? err.message : "Couldn't bring in the site." });
    } finally {
      importing = false;
      running.current = false;
      if (stopper.current === stop) stopper.current = null;
    }
  };
  const stopImport = () => {
    stopper.current?.abort();
    onClose();
  };

  const loading = status.state === "loading";
  const phone = layout === "phone";
  const title = again ? "Change the area" : "Find your park";
  const photo = imagery === "satellite";
  const survey = here?.survey && here.survey.covered !== "none" ? here.survey : null;
  const placeName = outline?.course?.name ?? outline?.name ?? (label ? label.split(",")[0] : "");

  // ---------------------------------------------------------------- pieces

  const sizeEl = dims && (
    <div className={`text-[13px] rounded-xl px-3 py-2 ${tooBig ? "bg-red-900/40 text-red-200" : "bg-white/[0.07] text-zinc-200"}`} data-testid="site-size">
      <span className="font-semibold">{fmtArea(dims.widthFt * dims.heightFt, units)}</span> · {fmtDist(dims.widthFt, units, false)} × {fmtDist(dims.heightFt, units)}
      {tooBig && <div className="text-xs mt-1">Keep it under {fmtDist(SITE_MAX_WIDTH_FT, units)} each way.</div>}
      {!drawing && <div className="text-[11.5px] text-zinc-400 mt-0.5" data-testid="frame-hint">{touch ? "Drag the corners · ⟳ turns it" : "Drag the corners · ⟳ turns it · Shift+drag draws a new one"}</div>}
      {angle !== 0 && <div className="flex items-center justify-between mt-1 text-[12px] text-zinc-300" data-testid="frame-turn">Turned {angle > 180 ? `${360 - angle}° left` : `${angle}° right`} <button className="text-orange-300 hover:text-orange-200 touch:min-h-[44px]" onClick={() => setAngle(0)}>North up</button></div>}
    </div>
  );
  const emptyEl = <div className="text-[13px] touch:text-[14px] text-zinc-400 px-1" data-testid="frame-empty">{touch ? "Search for your park, or tap Draw." : "Search for your park, or click Draw."}</div>;
  const drawHint = drawing && <p className="text-[12.5px] text-orange-200" data-testid="draw-hint">{touch ? "Drag across the map" : "Drag across the map · Esc stops"}</p>;

  /** One thing that comes in: a switch with what it is and where it's from. */
  const pill = (p: { id: string; icon: ReactNode; label: string; value?: string; on: boolean; set?: (v: boolean) => void; fixed?: boolean }) => (
    <button key={p.id} type="button" role="switch" aria-checked={p.on} aria-label={p.label} disabled={p.fixed} data-testid={`bring-${p.id}`}
      className={`inline-flex items-center gap-2 min-h-[38px] touch:min-h-[44px] rounded-[13px] pl-2 pr-3 text-[13px] transition-colors ${p.on ? "bg-white/[0.1] text-zinc-50 ring-1 ring-white/[0.08]" : "text-zinc-500 ring-1 ring-white/[0.12]"} ${p.fixed ? "cursor-default" : "hover:bg-white/[0.14]"}`}
      onClick={() => p.set?.(!p.on)}>
      <span className={`w-[18px] h-[18px] rounded-full grid place-items-center shrink-0 ${p.on ? "bg-[#a2cf6a] text-zinc-950" : "ring-[1.5px] ring-zinc-500"}`}>{p.on && <Check size={12} strokeWidth={3} />}</span>
      {p.icon}<span>{p.label}</span>{p.value && <span className="text-zinc-400 text-[12.5px]">{p.value}</span>}
    </button>
  );
  const photoValue = here?.photo ? [photoDateText(here.photo), `${photoFeetPerPx(here.photo)} ft`].filter(Boolean).join(" · ") : undefined;
  const pills = [
    pill({ id: "photo", icon: <ImageIcon size={15} />, label: photo ? "Photo" : "Street map", value: photo ? photoValue : undefined, on: true, set: () => setImagery(photo ? "streets" : "satellite") }),
    <fieldset key="ground" disabled className="contents" data-testid="import-elevation">{pill({ id: "ground", icon: <Mountain size={15} />, label: "Ground", value: survey ? `${survey.year} survey` : undefined, on: true, fixed: true })}</fieldset>,
    survey ? pill({ id: "lidar", icon: <Trees size={15} />, label: "Measured trees", value: `${survey.year}${survey.covered === "partial" ? " · part" : ""}`, on: lidar, set: setLidar }) : null,
    // (only where no survey covers the site: where one does, its measured trees are the ones)
    !survey && photo ? pill({ id: "photo-trees", icon: <TreeDeciduous size={15} />, label: "Trees from the photo", on: trees, set: setTrees }) : null,
    // (and where one does: the trees it missed, filled in from the photo)
    survey && lidar && photo ? pill({ id: "photo-fill", icon: <TreeDeciduous size={15} />, label: "Trees from the photo", value: "where the survey missed them", on: fill, set: setFill }) : null,
    pill({ id: "osm", icon: <Route size={15} />, label: "Paths, roads and more", value: "OpenStreetMap", on: osm, set: setOsm }),
    // (the US government's maps, only over the US)
    selection && inUS(selection) ? pill({ id: "gov", icon: <Droplets size={15} />, label: "Creeks, wetlands and buildings", value: "USGS · USFWS · FEMA", on: gov, set: setGov }) : null,
    outline?.course?.holes ? pill({ id: "course", icon: <Flag size={15} />, label: "Holes", value: `${outline.course.holes} mapped`, on: course, set: setCourse }) : null
  ];
  const frameChoice = outline && (
    <div className="flex gap-0.5 p-[3px] rounded-[13px] bg-white/[0.06]" role="radiogroup" aria-label="Frame">
      {[
        { id: "park", label: outline.kind === "course" ? "The course" : "Whole park", on: !drawing, run: () => { const f = frameAround(outline.bounds); setSelection(f); setFit({ bounds: f, key: Date.now() }); setDrawing(false); } },
        { id: "draw", label: "Draw", on: drawing, run: () => setDrawing(d => !d) }
      ].map(c => (
        <button key={c.id} role="radio" aria-checked={c.on} className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 touch:h-11 px-3 rounded-[10px] text-[13px] ${c.on ? "bg-white/[0.13] text-zinc-50 font-semibold" : "text-zinc-400 hover:text-zinc-200"}`} onClick={c.run}>
          {c.id === "draw" && <Pencil size={13} />}{c.label}
        </button>
      ))}
    </div>
  );
  const drawBtn = !outline && (
    <button className={`inline-flex items-center gap-1.5 h-9 touch:h-11 px-3.5 rounded-full text-[13px] font-semibold ${drawing ? "bg-orange-500 text-zinc-950" : "bg-white/[0.08] text-zinc-200 hover:bg-white/[0.12]"}`} aria-pressed={drawing} onClick={() => setDrawing(d => !d)}><Pencil size={13} /> Draw the area</button>
  );
  const againEl = again && !loading && <p className="text-[12.5px] text-amber-200/90 flex items-center gap-1.5" data-testid="import-again">Replaces what came in last time <HelpLink topic="re-import" label="Bring it in again" /></p>;
  const goLabel = again ? "Bring it in again" : "Bring it in";
  const errorEl = status.state === "error" && <div className="text-sm text-red-300" data-testid="import-status">{status.text}</div>;
  const goBtn = (
    <button className="w-full h-12 rounded-[14px] bg-[#a2cf6a] hover:bg-[#b3db80] active:bg-[#93c05c] text-zinc-950 text-[15px] font-bold disabled:opacity-40" onClick={() => void run()} disabled={!selection || tooBig || loading} data-testid="import-site">{goLabel}</button>
  );

  // The checklist while it comes in
  const secs = loading && started ? Math.floor((Date.now() - started) / 1000) : 0;
  const fraction = status.progress?.fraction ?? 0;
  const ring = (size: number) => {
    const r = size / 2 - 4, c = 2 * Math.PI * r;
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }} role="progressbar" aria-label="Import progress" aria-valuenow={Math.round(fraction * 100)}>
        <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={4.5} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#a2cf6a" strokeWidth={4.5} strokeLinecap="round" strokeDasharray={`${c * fraction} ${c}`} className="transition-[stroke-dasharray] duration-500" /></svg>
        <span className="absolute inset-0 grid place-items-center text-[12px] font-bold">{Math.round(fraction * 100)}%</span>
      </div>
    );
  };
  const rowValue = (s: SourceStatus) => {
    if (s.state === "done") return s.count !== undefined ? s.count.toLocaleString() : "Done";
    if (s.state === "not-here") return "Not here";
    if (s.state === "failed") return "Didn't come";
    if (s.state === "coming" && s.count) return s.count.toLocaleString();
    return "";
  };
  const checklist = (
    <div data-testid="import-status">
      <div className="flex items-center gap-3 mb-1">
        {ring(phone ? 42 : 50)}
        <div className="min-w-0">
          <div className="font-semibold text-[15px] text-zinc-50 truncate">{placeName ? `Bringing in ${placeName}` : "Bringing in the site"}</div>
          <div className="text-[12.5px] text-zinc-400 truncate">{status.text} <span className="tabular-nums" data-testid="import-elapsed">· {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span></div>
        </div>
      </div>
      {ORDER.filter(id => sources[id]).map(id => {
        const s = sources[id]!;
        const done = s.state === "done", miss = s.state === "not-here" || s.state === "failed";
        return (
          <div key={id} className="flex items-center gap-3 py-[7px] text-[13.5px]" data-testid={`import-row-${id}`}>
            <span className={`w-[22px] h-[22px] rounded-full grid place-items-center shrink-0 ${done ? "bg-[#a2cf6a] text-zinc-950" : miss ? "ring-[1.5px] ring-zinc-600" : "ring-2 ring-[#a2cf6a]/25"}`}>
              {done ? <Check size={13} strokeWidth={3} /> : s.state === "coming" ? <Loader2 size={14} className="animate-spin text-[#a2cf6a]" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={miss ? "text-zinc-400" : "text-zinc-50"}>{ROW_NAMES[id]}</span>
              {(s.source || s.detail) && <span className="block text-[11.5px] text-zinc-500 truncate">{[s.source, s.detail].filter(Boolean).join(" · ")}</span>}
            </span>
            <span className={`text-[13px] tabular-nums ${s.state === "coming" ? "text-[#a2cf6a] font-semibold" : "text-zinc-400"}`}>{rowValue(s)}</span>
          </div>
        );
      })}
      <div className="flex justify-end mt-1.5"><button className="h-9 touch:h-11 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-[13px] font-semibold text-zinc-200" onClick={() => setStopping(true)} data-testid="import-stop-ask">Stop</button></div>
    </div>
  );
  const stopEl = stopping && (
    <div className="glass-solid ring-1 ring-white/15 rounded-[18px] p-3.5 shadow-2xl" role="alertdialog" aria-label="Stop bringing in this site?" data-testid="import-stop">
      <p className="text-[14px] font-semibold text-zinc-50">Stop bringing in this site?</p>
      <p className="text-[13px] text-zinc-300 mt-0.5">None of it is kept.</p>
      <div className="flex justify-end gap-2 mt-2.5">
        <button className="h-9 touch:h-11 px-3.5 rounded-full text-[13.5px] font-semibold text-zinc-200 hover:bg-white/[0.08]" onClick={() => setStopping(false)} data-testid="import-keep-going">Keep going</button>
        <button className="h-9 touch:h-11 px-3.5 rounded-full text-[13.5px] font-semibold bg-red-500/90 hover:bg-red-500 text-white" onClick={stopImport} data-testid="import-stop-yes">Stop</button>
      </div>
    </div>
  );

  // The search, and what it found (courses and parks first, each with what it is)
  const kindIcon = (s: PlaceSuggestion) => s.kind === "course" ? <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-orange-400/15 text-orange-400 shrink-0"><Target size={18} /></span>
    : s.kind === "park" ? <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-[#a2cf6a]/15 text-[#a2cf6a] shrink-0"><Trees size={18} /></span>
    : <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-white/[0.07] text-zinc-300 shrink-0"><MapPin size={18} /></span>;
  const suggestionList = suggestions.length > 0 && (
    <div className={`${phone ? "mt-2" : "glass-solid absolute z-10 left-0 right-0 mt-2 rounded-[18px] p-1.5"}`}>
      {suggestions.map((s, i) => (
        <button key={i} className="w-full flex items-center gap-3 text-left px-2.5 py-2.5 rounded-[13px] hover:bg-white/[0.08] active:bg-white/[0.12]" onClick={() => void go(s)}>
          {kindIcon(s)}
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-50 truncate">{s.text}</span>
            {s.detail && <span className="block text-[12.5px] text-zinc-400 truncate">{s.kind === "course" ? "Disc golf course · " : s.kind === "park" ? "Park · " : ""}{s.detail}</span>}
          </span>
        </button>
      ))}
    </div>
  );
  const searchBox = (
    <div className="relative">
      <div className={`flex items-center gap-2.5 h-[52px] rounded-[18px] pl-4 pr-1.5 ${phone ? "bg-white/[0.08]" : "glass"}`}>
        <Search size={19} className="text-zinc-400 shrink-0" />
        <input aria-label="Search address" className="flex-1 min-w-0 bg-transparent text-base text-zinc-50 placeholder:text-zinc-500 focus:outline-none" placeholder="Park, course, address or lat, lon" enterKeyHint="search"
          value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void go(); }} autoFocus={!start.selection} />
        <button className="w-10 h-10 rounded-[12px] grid place-items-center text-zinc-300 hover:text-zinc-50 hover:bg-white/[0.1] disabled:opacity-40" onClick={() => void go()} disabled={!query.trim() || status.state === "searching"} aria-label="Search" title="Search" data-testid="site-search">
          {status.state === "searching" ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        </button>
      </div>
      {suggestionList}
    </div>
  );
  // (picked: the place's name, and a way back to the search)
  const placeChip = selection && !loading && (
    <div className="glass inline-flex items-center gap-2 h-11 rounded-full pl-3.5 pr-1.5 max-w-full">
      {outline?.course ? <Target size={16} className="text-orange-400 shrink-0" /> : outline ? <Trees size={16} className="text-[#a2cf6a] shrink-0" /> : <MapPin size={16} className="shrink-0" />}
      <span className="font-semibold text-[14px] text-zinc-50 truncate">{placeName || "Your area"}</span>
      <button className="w-8 h-8 rounded-full grid place-items-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.1]" aria-label="Search again" onClick={() => { setSelection(null); setOutline(null); picked.current = ""; }}><X size={15} /></button>
    </div>
  );

  const mapEl = (
    <SitePickerMap imagery={imagery} view={view} selection={selection} drawing={drawing} onDrawingChange={setDrawing} onSelect={onSelect} onTooSmall={tooSmall} onLocate={locate}
      selectViewSignal={0} units={units} outline={outline?.outline ?? null} fit={fit} arrived={arrived} angle={angle} onAngle={setAngle} />
  );
  const framing = !!selection && !loading;
  const panel = loading ? <>{checklist}{stopEl}</> : framing ? (
    <>
      {frameChoice}
      {drawBtn}
      {drawHint}
      {sizeEl}
      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mt-1">What comes in</div>
      <div className="flex flex-wrap gap-2" data-testid="import-what" data-here={here ? "ready" : "looking"}>{pills}</div>
      {errorEl}
      {againEl}
      {goBtn}
    </>
  ) : null;
  const closeBtn = <button className="glass w-11 h-11 rounded-full grid place-items-center text-zinc-300 hover:text-zinc-50" onClick={close} aria-label="Close" title="Close"><X size={20} /></button>;

  if (phone) {
    return (
      <div className="dg-compact fixed inset-0 z-50 bg-zinc-950" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0">{mapEl}</div>
        <div className="absolute left-3 right-3 top-[max(10px,env(safe-area-inset-top))] z-[1100] flex items-center gap-2">
          <div className="flex-1 min-w-0">{placeChip}</div>
          {closeBtn}
        </div>
        <div className="absolute left-0 right-0 bottom-0 z-[1100] glass rounded-t-[28px] px-4 pt-2.5 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-2.5 max-h-[62vh] overflow-y-auto">
          <div className="w-[38px] h-[5px] rounded-full bg-white/25 mx-auto mb-0.5" />
          {framing || loading ? panel : (
            <>
              <div className="font-bold text-zinc-50 text-[17px]">{title}</div>
              {searchBox}
              {drawBtn}
              {drawHint}
              {errorEl}
              {!suggestions.length && emptyEl}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0">{mapEl}</div>
      <div className="absolute top-4 right-4 z-[1100]">{closeBtn}</div>
      {!framing && !loading && (
        <div className="absolute left-1/2 -translate-x-1/2 top-4 z-[1100] w-[min(600px,calc(100%-160px))] flex flex-col gap-2">
          <div className="text-center font-bold text-zinc-50 text-[17px] drop-shadow">{title}</div>
          {searchBox}
          <div className="flex items-center justify-center gap-2">{drawBtn}{drawHint}</div>
          {errorEl}
          {!selection && !suggestions.length && <div className="text-center">{emptyEl}</div>}
        </div>
      )}
      {framing && <div className="absolute left-16 top-4 z-[1100] max-w-[50%]">{placeChip}</div>}
      {panel && (
        <div className="absolute right-4 top-[72px] z-[1100] w-[350px] max-h-[calc(100%-90px)] overflow-y-auto glass rounded-[22px] p-[18px] flex flex-col gap-2.5">
          {panel}
        </div>
      )}
    </div>
  );
}

