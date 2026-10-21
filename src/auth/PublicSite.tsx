// The public course page, for anyone with a link (#site=…): no account. It shows only what the
// owner published and the link allows: the course map, its numbers and holes, tee signs, the
// scorecard, downloads, and the course to look round in 3D when allowed.
import { useEffect, useState, type ReactNode } from "react";
import { Download, Lock, Map as MapIcon, Mountain, X } from "lucide-react";
import { normalizeCourse } from "../lib/course";
import { safeDoc } from "../lib/safeDoc";
import { fmtDist, fmtElev } from "../lib/units";
import { useCourse, useEditor } from "../state/course";
import { show } from "../state/files";
import type { CourseDoc, Units } from "../types";
import { Logo } from "./parts";
import { useServerCourse } from "./courses";

export const SITE_TOKEN = /^#site=([A-Za-z0-9_-]{20,})$/.exec(location.hash)?.[1] ?? null;

interface Site {
  info: { name: string; designer?: string; units?: Units; totals?: { holes: number; par: number; length: number; climb: number }; holes: { id?: string; label: string; name: string; par: number; length: number; elevation: number; playsLike: number }[] };
  shown: Record<string, boolean>;
  publishedAt: string;
  hasCourse: boolean;
  files: string[];
}

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
  const [big, setBig] = useState<string | null>(null);

  const load = async (pw: string) => {
    const res = await get("", pw);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.needsPassword) { setNeedsPassword(true); setTried(pw ? "Wrong password" : ""); return; }
    if (!res.ok) { setError(data.error ?? "This link doesn't work"); return; }
    setNeedsPassword(false);
    setSite(data);
    // (pictures through the link: the password goes with each)
    const out: Record<string, string> = {};
    for (const name of data.files as string[]) {
      if (!/\.(webp|png|jpeg)$/.test(name) || name.startsWith("photo.")) continue;
      const f = await get(`/files/${name}`, pw);
      if (f.ok) out[name] = URL.createObjectURL(await f.blob());
    }
    setFiles(out);
  };
  useEffect(() => { void load(""); }, []);

  /** The course to look round (and a hole's flyover, when one is asked for). */
  const open3d = async (flyHole?: string) => {
    const res = await get("/course", password);
    if (!res.ok) return;
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

  if (explore) {
    return (
      <>
        {children}
        <button className="fixed top-2 right-2 z-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold bg-zinc-900/95 border border-zinc-700 text-zinc-100" onClick={() => setExplore(false)} data-testid="leave-3d"><X size={14} /> Back to the course page</button>
      </>
    );
  }
  if (error) return <Plain><p className="text-zinc-300">{error}.</p></Plain>;
  if (needsPassword) {
    return (
      <Plain>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void load(password); }}>
          <div className="flex items-center gap-2 text-zinc-200"><Lock size={16} /> This course page has a password.</div>
          <input type="password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" autoFocus />
          {tried && <p role="alert" className="text-sm text-red-300">{tried}</p>}
          <button className="w-full rounded-lg px-3 py-2 font-semibold bg-orange-500 text-white">Open</button>
        </form>
      </Plain>
    );
  }
  if (!site) return <div className="min-h-[100dvh] bg-zinc-950" aria-busy="true" />;

  const u = site.info.units ?? "ft";
  // (each hole's flyover, when the link shows flyovers and the course)
  const flies = site.hasCourse && !!site.shown.flyovers;
  const t = site.info.totals;
  const signs = Object.keys(files).filter(n => n.startsWith("sign-")).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const map = files["map.webp"] ?? files["map.png"];
  const card = files["scorecard.webp"] ?? files["scorecard.png"];
  const download = async (name: string) => {
    const f = await get(`/files/${name}`, password);
    if (!f.ok) return;
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
      {map && (
        <div className="max-w-5xl mx-auto px-4">
          <button className="block w-full rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-600" onClick={() => setBig(map)} aria-label="The course map, bigger">
            <img src={map} alt={`Map of ${site.info.name}`} className="w-full h-auto" />
          </button>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {t && site.shown.stats && (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6" data-testid="public-totals">
            {[["Holes", String(t.holes)], ["Par", String(t.par)], ["Length", fmtDist(t.length, u)], ["Climb", fmtElev(t.climb, u)]].map(([k, v]) => (
              <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"><dt className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">{k}</dt><dd className="text-2xl font-bold">{v}</dd></div>
            ))}
          </dl>
        )}

        <div className="flex flex-wrap gap-2 my-6">
          {site.hasCourse && (
            <button className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-semibold bg-orange-500 hover:bg-orange-400 text-white" onClick={() => void open3d()} data-testid="explore">
              {site.shown.view3d ? <Mountain size={16} /> : <MapIcon size={16} />} {site.shown.view3d ? "Explore in 3D" : "Explore the map"}
            </button>
          )}
          {site.files.filter(f => /\.(gpx|kml)$/.test(f)).map(f => (
            <button key={f} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700" onClick={() => void download(f)}><Download size={15} /> {f.endsWith("gpx") ? "GPS file (GPX)" : "Google Earth (KML)"}</button>
          ))}
        </div>

        {site.shown.stats && site.info.holes.length > 0 && (
          <section className="my-8">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-3">Holes</h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm" data-testid="public-holes">
                <thead className="bg-zinc-900 text-zinc-400 text-[12px] uppercase tracking-wider"><tr><th className="text-left p-2.5">Hole</th><th className="text-right p-2.5">Par</th><th className="text-right p-2.5">Length</th><th className="text-right p-2.5">Elevation</th><th className="text-right p-2.5 hidden sm:table-cell">Plays like</th>{flies && <th className="p-2.5" />}</tr></thead>
                <tbody>
                  {site.info.holes.map(h => (
                    <tr key={h.label} className="border-t border-zinc-800">
                      <td className="p-2.5"><span className="font-bold">{h.label}</span>{h.name && <span className="text-zinc-400"> · {h.name}</span>}</td>
                      <td className="p-2.5 text-right tabular-nums">{h.par}</td>
                      <td className="p-2.5 text-right tabular-nums">{fmtDist(h.length, u)}</td>
                      <td className="p-2.5 text-right tabular-nums">{fmtElev(h.elevation, u)}</td>
                      <td className="p-2.5 text-right tabular-nums hidden sm:table-cell">{fmtDist(h.playsLike, u)}</td>
                      {flies && <td className="p-1.5 text-right">{h.id && <button className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white" onClick={() => void open3d(h.id)} data-testid="fly-hole">▶ Fly</button>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {signs.length > 0 && (
          <section className="my-8">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-3">Tee signs</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="public-signs">
              {signs.map(n => (
                <li key={n}><button className="block w-full rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600" onClick={() => setBig(files[n])}><img src={files[n]} alt={`Tee sign, hole ${n.slice(5).split(".")[0]}`} className="w-full" loading="lazy" /></button></li>
              ))}
            </ul>
          </section>
        )}

        {card && (
          <section className="my-8">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-3">Scorecard</h2>
            <button className="block w-full rounded-xl overflow-hidden border border-zinc-800" onClick={() => setBig(card)}><img src={card} alt="Scorecard" className="w-full bg-white" /></button>
          </section>
        )}

        <footer className="mt-12 flex items-center gap-2 text-[12px] text-zinc-600"><Logo size={18} /> HyzerLab · {new Date(site.publishedAt).toLocaleDateString()}</footer>
      </main>

      {big && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3" onClick={() => setBig(null)} role="dialog" aria-label="Picture">
          <img src={big} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}

const Plain = ({ children }: { children: ReactNode }) => (
  <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-4">
    <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4"><Logo size={28} /><span className="font-bold text-zinc-50">HyzerLab</span></div>
      {children}
    </div>
  </div>
);
