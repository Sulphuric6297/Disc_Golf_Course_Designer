// The public course page, for anyone with a link (#site=…): no account. It shows only what the
// owner published and the link allows: the course map, its numbers and holes, tee signs, the
// scorecard, downloads, and the course to look round in 3D when allowed.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { ChevronLeft, Download, Loader2, Lock, Map as MapIcon, Mountain, X } from "lucide-react";
import { Loading, LoadingScreen } from "../components/ui";
import { normalizeCourse } from "../lib/course";
import { safeDoc } from "../lib/safeDoc";
import { fmtDist, fmtElev } from "../lib/units";
import { useCourse, useEditor } from "../state/course";
import { show } from "../state/files";
import { getView, onLiveView } from "../state/view";
import type { CourseDoc, Units } from "../types";
import { Logo } from "./parts";
import { holeFacts, type HoleNumbers } from "./holeFacts";
import { useServerCourse } from "./courses";

// (a link's random address or the name its owner gave it: …/springfield-park, or …#site=…)
export const SITE_TOKEN = /^\/([a-z0-9][a-z0-9-]{2,39}|[A-Za-z0-9_-]{40,})\/?$/.exec(location.pathname)?.[1] ?? /^#site=([A-Za-z0-9_-]{3,})$/.exec(location.hash)?.[1] ?? null;

/** Back from the 3D view or the map to the course page (set while they're open). */
const usePublicBack = create<{ back: (() => void) | null }>(() => ({ back: null }));

/** The way back to the course page, at the left of the view's top bar like a back button. */
export function CoursePageButton() {
  const back = usePublicBack(s => s.back);
  if (!back) return null;
  return (
    <button className="shrink-0 inline-flex items-center gap-0.5 h-[34px] pl-1.5 pr-3 rounded-full bg-white/[0.1] hover:bg-white/[0.16] text-sm font-semibold text-zinc-50" onClick={back} data-testid="leave-3d">
      <ChevronLeft size={18} /> Course page
    </button>
  );
}

interface Site {
  info: { name: string; designer?: string; units?: Units; totals?: { holes: number; par: number; length: number; climb: number }; holes: (HoleNumbers & { id?: string; label: string; name: string })[] };
  shown: Record<string, boolean>;
  publishedAt: string;
  hasCourse: boolean;
  files: string[];
}

/** The pictures shown on the page, each in one format (the lighter one when there are two). */
const pictures = (files: string[]) => {
  const pics = files.filter(n => /\.(webp|png|jpeg)$/.test(n) && !n.startsWith("photo."));
  return pics.filter(n => !(n.endsWith(".png") && pics.includes(n.replace(/\.png$/, ".webp"))));
};
/** The course page's own parts first: the map, then the signs and the card. */
const byNeed = (n: string) => (n.startsWith("map.") ? 0 : n.startsWith("sign-") ? 1 : 2);

const get = async (path: string, password: string) => {
  const res = await fetch(`./api/public/${SITE_TOKEN}${path}`, { headers: password ? { "x-link-password": password } : {} });
  return res;
};

export function PublicSite({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<Site | null>(null);
  const [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [explore, setExplore] = useState(false);
  // (the course on its way to the 3D view or the map, and once there, until it's drawn)
  const [opening, setOpening] = useState<"3d" | "map" | null>(null);
  const [openError, setOpenError] = useState("");
  const [drawn, setDrawn] = useState(false);
  // (a file on its way down)
  const [fetching, setFetching] = useState("");
  const [big, setBig] = useState<string | null>(null);
  const [openHole, setOpenHole] = useState<string | null>(null);

  const load = async (pw: string) => {
    const res = await get("", pw);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.needsPassword) { setNeedsPassword(true); setTried(pw ? "Wrong password" : ""); return; }
    if (!res.ok) { setError(data.error ?? "This link doesn't work"); return; }
    setNeedsPassword(false);
    setSite(data);
    // Pictures through the link (the password goes with each), each shown as it comes: the map
    // first, then the rest a few at a time
    const one = async (name: string) => {
      const f = await get(`/files/${name}`, pw);
      if (f.ok) { const url = URL.createObjectURL(await f.blob()); setFiles(o => ({ ...o, [name]: url })); }
    };
    const queue = pictures(data.files as string[]).sort((a, b) => byNeed(a) - byNeed(b));
    await Promise.all(queue.filter(n => byNeed(n) === 0).map(one));
    const rest = queue.filter(n => byNeed(n) > 0);
    await Promise.all(Array.from({ length: 4 }, async () => { for (let n = rest.shift(); n; n = rest.shift()) await one(n); }));
    // (the 3D view's code fetched meanwhile, ready for Explore)
    if (data.hasCourse) setTimeout(() => { void import("../App").catch(() => {}); void import("../three/ezShapes").catch(() => {}); }, 1500);
  };
  // (the page couldn't be had: said so, not left loading)
  const [checking, setChecking] = useState(false);
  const tryLoad = async (pw: string) => {
    setChecking(true);
    try { await load(pw); } catch { setError("This course page couldn't be loaded. Check the connection and reload"); } finally { setChecking(false); }
  };
  useEffect(() => { void tryLoad(""); }, []);

  /** The course to look round (and a hole's flyover, when one is asked for). */
  const open3d = async (flyHole?: string) => {
    if (opening) return;
    setOpenError("");
    setOpening(site!.shown.view3d || flyHole ? "3d" : "map");
    setDrawn(false);
    try {
      await openCourse(flyHole);
    } catch {
      setOpenError("The course couldn't be opened. Check the connection and try again.");
      setOpening(null);
    }
  };
  const openCourse = async (flyHole?: string) => {
    const res = await get("/course", password);
    if (!res.ok) throw new Error("no course");
    const { doc } = await res.json() as { doc: CourseDoc };
    let background: string | null = null;
    const photo = site!.files.find(f => f.startsWith("photo."));
    if (photo) {
      const f = await get(`/files/${photo}`, password);
      if (f.ok) {
        const b = await f.blob();
        background = await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });
      }
    }
    const d = normalizeCourse(safeDoc({ ...doc, background }));
    useServerCourse.setState({ role: "viewer", perms: { ...site!.shown, copy: false, downloads: false, comments: false } as never, id: null });
    useCourse.setState({ readOnly: true });
    show(d);
    useEditor.getState().set({ view: site!.shown.view3d && !site!.shown.map ? "3d" : "2d" });
    setExplore(true);
    // (straight down the hole from its tee)
    if (flyHole && d.holes.some(h => h.id === flyHole)) setTimeout(() => useEditor.getState().set({ view: "3d", teeView: flyHole, flyover: true }), 400);
  };

  // Opened: the view up and its first frames drawn before the wait goes
  useEffect(() => {
    if (!explore) return;
    let raf = 0;
    const up = (v: unknown) => { if (v) raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setDrawn(true)); }); };
    // (already up when the editor's code was loaded before: a second visit)
    const stop = onLiveView(up);
    up(getView());
    return () => { stop(); cancelAnimationFrame(raf); };
  }, [explore]);
  useEffect(() => { if (drawn) setOpening(null); }, [drawn]);
  useEffect(() => {
    usePublicBack.setState({ back: explore ? () => setExplore(false) : null });
    return () => usePublicBack.setState({ back: null });
  }, [explore]);

  if (explore) {
    return (
      <>
        {children}
        {!drawn && <Opening what={opening ?? "3d"} />}
      </>
    );
  }
  if (error) return <Plain><p className="text-zinc-300">{error}.</p></Plain>;
  if (needsPassword) {
    return (
      <Plain>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!checking) void tryLoad(password); }}>
          <div className="flex items-center gap-2 text-zinc-200"><Lock size={16} /> This course page has a password.</div>
          <input type="password" className="w-full bg-white/[0.07] rounded-lg px-3 py-2 text-zinc-100" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" autoFocus />
          {tried && <p role="alert" className="text-sm text-red-300">{tried}</p>}
          <button className="w-full rounded-lg px-3 py-2 font-semibold bg-orange-500 text-zinc-950 inline-flex items-center justify-center gap-2 disabled:opacity-80" disabled={checking}>{checking && <Loader2 size={15} className="animate-spin" />}{checking ? "Opening…" : "Open"}</button>
        </form>
      </Plain>
    );
  }
  if (!site) return <LoadingScreen label="Loading the course…" />;

  const u = site.info.units ?? "ft";
  // (each hole's flyover, when the link shows flyovers and the course)
  const flies = site.hasCourse && !!site.shown.flyovers;
  const t = site.info.totals;
  const shownPics = pictures(site.files);
  const signs = shownPics.filter(n => n.startsWith("sign-")).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const mapName = shownPics.find(n => n.startsWith("map."));
  const map = mapName ? files[mapName] : undefined;
  const cardName = shownPics.find(n => n.startsWith("scorecard."));
  const card = cardName ? files[cardName] : undefined;
  const download = async (name: string) => {
    setFetching(name);
    const f = await get(`/files/${name}`, password).catch(() => null).finally(() => setFetching(""));
    if (!f?.ok) { setOpenError("That file couldn't be downloaded. Try again."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await f.blob());
    a.download = `${(site.info.name || "course").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${name.split(".").pop()}`;
    a.click();
  };
  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100" data-testid="public-site">
      <header className="max-w-5xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">{site.info.name}</h1>
        {site.info.designer && <p className="text-zinc-300 mt-1">{site.info.designer}</p>}
      </header>
      {mapName && (
        <div className="max-w-5xl mx-auto px-4">
          {map ? (
            <button className="block w-full rounded-2xl overflow-hidden border border-white/[0.08] hover:border-zinc-600 animate-[dgfade_0.3s_ease_both]" onClick={() => setBig(map)} aria-label="The course map, bigger">
              <img src={map} alt={`Map of ${site.info.name}`} className="w-full h-auto" />
            </button>
          ) : (
            <div className="w-full aspect-[17/11] rounded-2xl glass border border-white/[0.08] flex items-center justify-center" data-testid="map-loading">
              <Loading label="Loading the course map…" />
            </div>
          )}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {t && site.shown.stats && (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6" data-testid="public-totals">
            {[["Holes", String(t.holes)], ["Par", String(t.par)], ["Length", fmtDist(t.length, u)], ["Climb", fmtElev(t.climb, u)]].map(([k, v]) => (
              <div key={k} className="glass border border-white/[0.08] rounded-xl p-3"><dt className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">{k}</dt><dd className="text-2xl font-bold">{v}</dd></div>
            ))}
          </dl>
        )}

        <div className="flex flex-wrap gap-2 my-6">
          {site.hasCourse && (
            <button className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950 disabled:opacity-80" onClick={() => void open3d()} disabled={!!opening} aria-busy={!!opening || undefined} data-testid="explore">
              {opening ? <Loader2 size={16} className="animate-spin" /> : site.shown.view3d ? <Mountain size={16} /> : <MapIcon size={16} />} {opening ? "Opening…" : site.shown.view3d ? "Explore in 3D" : "Explore the map"}
            </button>
          )}
          {site.files.filter(f => /\.(gpx|kml)$/.test(f)).map(f => (
            <button key={f} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-semibold bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] disabled:opacity-70" disabled={fetching === f} onClick={() => void download(f)}>{fetching === f ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {f.endsWith("gpx") ? "GPS file (GPX)" : "Google Earth (KML)"}</button>
          ))}
        </div>
        {openError && <p role="alert" className="-mt-3 mb-6 text-sm text-red-300">{openError}</p>}

        {site.shown.stats && site.info.holes.length > 0 && (
          <section className="my-8">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-3">Holes</h2>
            <ul className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.08] overflow-hidden" data-testid="public-holes">
              {site.info.holes.map(h => (
                <li key={h.label} data-testid="public-hole">
                  <button className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.06]" onClick={() => setOpenHole(openHole === h.label ? null : h.label)} aria-expanded={openHole === h.label}>
                    <span className="w-8 h-8 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0">{h.label}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{h.name || `Hole ${h.label}`}</span>
                      <span className="block text-sm text-zinc-400">Par {h.par} · {fmtDist(h.length, u)} · {fmtElev(h.elevation, u)}</span>
                    </span>
                    {flies && h.id && <span role="button" tabIndex={0} className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950" onClick={e => { e.stopPropagation(); void open3d(h.id); }} onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); void open3d(h.id); } }} data-testid="fly-hole">▶ Fly</span>}
                    <span className={`text-zinc-500 transition-transform ${openHole === h.label ? "rotate-90" : ""}`}>›</span>
                  </button>
                  {openHole === h.label && (
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 pb-3" data-testid="hole-facts">
                      {holeFacts(h, u).map(([k, v]) => (
                        <div key={k} className="glass rounded-lg p-2"><dt className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">{k}</dt><dd className="font-semibold">{v}</dd></div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {signs.length > 0 && (
          <section className="my-8">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-3">Tee signs</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="public-signs">
              {signs.map(n => (
                <li key={n}>{files[n]
                  ? <button className="block w-full rounded-xl overflow-hidden border border-white/[0.08] hover:border-zinc-600 animate-[dgfade_0.3s_ease_both]" onClick={() => setBig(files[n])}><img src={files[n]} alt={`Tee sign, hole ${n.slice(5).split(".")[0]}`} className="w-full" loading="lazy" /></button>
                  : <div className="w-full aspect-[2/3] rounded-xl glass border border-white/[0.08] animate-pulse" role="img" aria-label={`Tee sign, hole ${n.slice(5).split(".")[0]}, loading`} />}</li>
              ))}
            </ul>
          </section>
        )}

        {cardName && (
          <section className="my-8">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-3">Scorecard</h2>
            {card
              ? <button className="block w-full rounded-xl overflow-hidden border border-white/[0.08] animate-[dgfade_0.3s_ease_both]" onClick={() => setBig(card)}><img src={card} alt="Scorecard" className="w-full bg-white" /></button>
              : <div className="w-full aspect-[11/5] rounded-xl glass border border-white/[0.08] animate-pulse" role="img" aria-label="Scorecard, loading" />}
          </section>
        )}

        <footer className="mt-12 flex items-center gap-2 text-[12px] text-zinc-600"><Logo size={18} /> HyzerLab · {new Date(site.publishedAt).toLocaleDateString()}</footer>
      </main>

      {big && <Zoomable src={big} onClose={() => setBig(null)} />}
      {opening && <Opening what={opening} />}
    </div>
  );
}

/** The course on its way to the 3D view or the map: from the click until it's drawn. */
const Opening = ({ what }: { what: "3d" | "map" }) => (
  <div className="fixed inset-0 z-[60] bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center animate-[dgfade_0.2s_ease_both]" data-testid="opening-course">
    <Loading label={what === "map" ? "Opening the map…" : "Opening the course in 3D…"} />
  </div>
);

const Plain = ({ children }: { children: ReactNode }) => (
  <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-4">
    <div className="w-full max-w-sm glass border border-white/[0.08] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4"><Logo size={28} /><span className="font-bold text-zinc-50">HyzerLab</span></div>
      {children}
    </div>
  </div>
);

/** A picture full screen: pinch, wheel or double-tap to zoom, drag to look round, tap or Esc to close. */
function Zoomable({ src, onClose }: { src: string; onClose: () => void }) {
  const [v, setV] = useState({ k: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ k: number; x: number; y: number; d: number; cx: number; cy: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const clamp = (k: number) => Math.max(1, Math.min(8, k));
  const zoomAt = (k2: number, cx: number, cy: number) => setV(o => {
    const k = clamp(k2);
    const ox = cx - innerWidth / 2, oy = cy - innerHeight / 2;
    return k === 1 ? { k: 1, x: 0, y: 0 } : { k, x: ox - ((ox - o.x) * k) / o.k, y: oy - ((oy - o.y) * k) / o.k };
  });
  const centre = () => { const a = [...pts.current.values()]; return { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length, d: a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0 }; };
  return (
    <div className="fixed inset-0 z-50 bg-black/95 overflow-hidden touch-none select-none" role="dialog" aria-label="Picture" data-testid="zoomable"
      onWheel={e => zoomAt(v.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY)}
      onPointerDown={e => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const c = centre();
        start.current = { ...v, d: c.d, cx: c.x, cy: c.y, moved: false };
      }}
      onPointerMove={e => {
        if (!pts.current.has(e.pointerId) || !start.current) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const s0 = start.current, c = centre();
        if (Math.hypot(c.x - s0.cx, c.y - s0.cy) > 6 || (c.d && s0.d && Math.abs(c.d - s0.d) > 6)) s0.moved = true;
        if (c.d && s0.d) {
          const k = clamp((s0.k * c.d) / s0.d);
          const ox = s0.cx - innerWidth / 2, oy = s0.cy - innerHeight / 2;
          setV({ k, x: ox - ((ox - s0.x) * k) / s0.k + (c.x - s0.cx), y: oy - ((oy - s0.y) * k) / s0.k + (c.y - s0.cy) });
        } else if (s0.k > 1) setV({ k: s0.k, x: s0.x + (c.x - s0.cx), y: s0.y + (c.y - s0.cy) });
      }}
      onPointerUp={e => {
        pts.current.delete(e.pointerId);
        const s0 = start.current;
        if (pts.current.size) { const c = centre(); start.current = { ...v, d: c.d, cx: c.x, cy: c.y, moved: true }; return; }
        start.current = null;
        if (s0?.moved) return;
        // (a double tap zooms in there, or back out; a tap with nothing zoomed closes)
        const now = Date.now();
        if (now - lastTap.current < 300) { lastTap.current = 0; zoomAt(v.k > 1 ? 1 : 3, e.clientX, e.clientY); return; }
        lastTap.current = now;
        setTimeout(() => { if (lastTap.current === now && v.k === 1) onClose(); }, 320);
      }}>
      <img src={src} alt="" draggable={false} className="absolute inset-0 m-auto max-w-full max-h-full object-contain will-change-transform" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})`, transformOrigin: "center" }} />
      <button className="absolute top-3 right-3 rounded-full w-10 h-10 glass border border-white/[0.12] text-zinc-100 flex items-center justify-center" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={onClose} aria-label="Close"><X size={18} /></button>
    </div>
  );
}
