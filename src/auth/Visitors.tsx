// Who visits the course's public page (Share, Visitors): how many, day by day, how they found it
// (tee sign QR codes by hole, the course's named links, search engines, other websites), the holes
// looked at most, when they come and on what. Counted without cookies, nothing personal kept
// (auth/visits; the server's routes/public).
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Globe, Link2, Lock, QrCode, Search } from "lucide-react";
import { holeLabel } from "../lib/course";
import { courseStats } from "../lib/holeStats";
import { fmtDist } from "../lib/units";
import { useCourse } from "../state/course";
import { api } from "./api";
import { Segmented } from "../components/ui";

interface Stats {
  from: string; to: string; days: { day: string; n: number }[]; total: number; before: number | null; now: number; typicalSeconds: number;
  sources: { source: "sign" | "link" | "search" | "web" | "direct"; key: string | null; label: string | null; n: number }[];
  holes: { hole: string; n: number }[]; flyovers: { hole: string; n: number }[];
  heat: { dow: number; hour: number; n: number }[]; phone: number; computer: number;
}

const PERIODS = [{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }, { value: 0, label: "All" }] as const;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// (rows Monday first, as a week is read; columns three hours each)
const ROWS = [1, 2, 3, 4, 5, 6, 0];
const COLS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
const LIME = "#a2cf6a";
const card = "glass rounded-[20px] p-4 mb-3";
const head = "text-[11.5px] font-semibold tracking-[0.06em] uppercase text-zinc-400";
const num = { fontFamily: "Oswald, Inter" };

const dayAt = (s: string, k: number) => new Date(Date.parse(`${s}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const nice = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const ampm = (h: number) => (h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`);
const howLong = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

export function Visitors({ id }: { id: string }) {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    const load = () => api<Stats>("GET", `courses/${id}/visitors?days=${days}`).then(s => { if (live) setStats(s); }).catch(e => { if (live) setError(e instanceof Error ? e.message : "Couldn't load the visitors"); });
    void load();
    // (who's here now, kept fresh while it's open)
    const t = window.setInterval(() => void load(), 60_000);
    return () => { live = false; window.clearInterval(t); };
  }, [id, days]);
  return (
    <div className="px-4 pb-2" data-testid="visitors">
      <div className="mb-3"><Segmented label="Over" value={days} onChange={v => setDays(v)} options={PERIODS.map(p => ({ value: p.value, label: p.label }))} /></div>
      {error ? <p className="text-sm text-red-300">{error}</p> : !stats ? <p className="text-sm text-zinc-400">Counting…</p> : <Board stats={stats} days={days} />}
      <p className="flex gap-2 items-start text-[12.5px] text-zinc-400 leading-snug px-1 pt-1"><Lock size={14} className="shrink-0 mt-0.5" />No cookies and nothing personal kept: a visitor is counted once a day and can't be followed from one day to the next.</p>
    </div>
  );
}

function Board({ stats, days }: { stats: Stats; days: number }) {
  const doc = useCourse(s => s.doc);
  // Every day of the span, none missing (a day nobody came is a 0)
  const series = useMemo(() => {
    const by = new Map(stats.days.map(d => [d.day, d.n]));
    const n = Math.max(1, Math.round((Date.parse(stats.to) - Date.parse(stats.from)) / 86_400_000) + 1);
    return Array.from({ length: n }, (_, k) => { const day = dayAt(stats.from, k); return { day, n: by.get(day) ?? 0 }; });
  }, [stats]);
  if (!stats.total && !stats.now) {
    return (
      <div className={`${card} text-center py-8`} data-testid="visitors-none">
        <div className="text-[15px] font-semibold text-zinc-100">No visitors yet{days ? " in this time" : ""}</div>
        <p className="text-[13px] text-zinc-400 mt-1.5 max-w-[300px] mx-auto">Share a public link, or put one in a QR code on your tee signs: each sign then shows here as it's scanned.</p>
      </div>
    );
  }
  const change = stats.before ? Math.round(((stats.total - stats.before) / stats.before) * 100) : null;
  const flown = stats.flyovers.reduce((a, f) => a + f.n, 0);
  // Weekends against weekdays, a day each
  const wk = series.filter(d => [0, 6].includes(new Date(`${d.day}T12:00:00Z`).getUTCDay())), wd = series.filter(d => ![0, 6].includes(new Date(`${d.day}T12:00:00Z`).getUTCDay()));
  const avg = (xs: typeof series) => (xs.length ? xs.reduce((a, d) => a + d.n, 0) / xs.length : 0);
  const ratio = avg(wd) > 0 ? avg(wk) / avg(wd) : 0;
  return (
    <>
      <div className={card}>
        <div className={head}>People who visited</div>
        <div className="flex items-end gap-2.5 mt-1">
          <div className="text-[52px] leading-none font-semibold text-zinc-50" style={num} data-testid="visitors-total">{stats.total.toLocaleString()}</div>
          {change !== null && <div className={`mb-2 text-[13px] font-bold px-2 py-0.5 rounded-full ${change >= 0 ? "text-[#a2cf6a] bg-[#a2cf6a]/15" : "text-amber-300 bg-amber-300/15"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</div>}
        </div>
        {change !== null && <div className="text-[13px] text-zinc-400">than the {days} days before</div>}
        <DayChart series={series} />
        {ratio >= 1.3 && wk.length > 1 && <p className="text-[13.5px] text-zinc-300 mt-2.5">Weekends bring <b className="text-zinc-50">{ratio.toFixed(1)}×</b> the visitors of weekdays.</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Mini n={<span className="inline-flex items-center gap-1.5">{stats.now > 0 && <span className="w-2 h-2 rounded-full bg-[#a2cf6a] shadow-[0_0_0_4px_rgba(162,207,106,0.18)]" />}{stats.now}</span>} t="here now" testid="visitors-now" />
        <Mini n={flown.toLocaleString()} t="flyovers played" />
        <Mini n={stats.typicalSeconds ? howLong(stats.typicalSeconds) : "–"} t="a visit, typical" />
      </div>
      <Sources stats={stats} />
      <Signs stats={stats} />
      <Holes stats={stats} doc={doc} />
      <Heat stats={stats} />
      {stats.phone + stats.computer > 0 && (
        <div className={card}>
          <div className={head}>On what</div>
          <div className="flex h-2.5 rounded-full overflow-hidden my-3">
            <span style={{ width: `${(stats.phone / (stats.phone + stats.computer)) * 100}%`, background: LIME }} />
            <span style={{ flex: 1, background: "#78bad0" }} />
          </div>
          <div className="flex justify-between text-[13.5px] text-zinc-300">
            <span><b className="text-zinc-50">{Math.round((stats.phone / (stats.phone + stats.computer)) * 100)}%</b> on phones</span>
            <span><b className="text-zinc-50">{Math.round((stats.computer / (stats.phone + stats.computer)) * 100)}%</b> on computers</span>
          </div>
        </div>
      )}
    </>
  );
}

function Mini({ n, t, testid }: { n: React.ReactNode; t: string; testid?: string }) {
  return (
    <div className="glass rounded-[18px] px-3 py-2.5" data-testid={testid}>
      <div className="text-[26px] leading-tight font-semibold text-zinc-50" style={num}>{n}</div>
      <div className="text-[12px] text-zinc-400">{t}</div>
    </div>
  );
}

/** The visitors day by day: a soft line with a glow, weekends shaded; a tap or hover on a day says
 * how many came. */
function DayChart({ series }: { series: { day: string; n: number }[] }) {
  const [at, setAt] = useState<number | null>(null);
  const W = 340, H = 120, top = 22, bottom = 6;
  const max = Math.max(1, ...series.map(d => d.n));
  const x = (k: number) => (series.length < 2 ? W / 2 : 2 + (k / (series.length - 1)) * (W - 4));
  const y = (n: number) => top + (1 - n / max) * (H - top - bottom);
  // (a smooth curve through the days: Catmull-Rom as Béziers, never overshooting below 0)
  const pts = series.map((d, k) => [x(k), y(d.n)] as const);
  let line = `M${pts[0][0]} ${pts[0][1]}`;
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(H - bottom, p1[1] + (p2[1] - p0[1]) / 6)], c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(H - bottom, p2[1] - (p3[1] - p1[1]) / 6)];
    line += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${line} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`;
  const step = series.length > 1 ? (W - 4) / (series.length - 1) : W;
  const shown = at ?? series.reduce((b, d, k) => (d.n > series[b].n ? k : b), 0);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.max(0, Math.min(series.length - 1, Math.round(((e.clientX - r.left) / r.width * W - 2) / step))));
  };
  const ticks = [0, Math.round((series.length - 1) / 2), series.length - 1].filter((k, i, a) => a.indexOf(k) === i);
  return (
    <div className="relative mt-2.5 -mx-1" data-testid="visitors-chart">
      <div className="absolute -translate-x-1/2 px-2 py-1 rounded-[10px] bg-black/70 ring-1 ring-white/15 text-[12px] text-zinc-50 whitespace-nowrap pointer-events-none" style={{ left: `${(x(shown) / W) * 100}%`, top: 0 }}>
        {nice(series[shown].day)} · <b style={{ color: LIME }}>{series[shown].n}</b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setAt(null)} role="img" aria-label="Visitors by day">
        <defs>
          <linearGradient id="vfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={LIME} stopOpacity=".42" /><stop offset="1" stopColor={LIME} stopOpacity="0" /></linearGradient>
          <filter id="vglow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {series.length <= 120 && series.map((d, k) => [0, 6].includes(new Date(`${d.day}T12:00:00Z`).getUTCDay()) && (
          <rect key={d.day} x={x(k) - step / 2} y={top} width={step} height={H - top} fill="rgba(255,255,255,.035)" />
        ))}
        <path d={area} fill="url(#vfill)" />
        <path d={line} fill="none" stroke={LIME} strokeWidth="5" opacity=".35" filter="url(#vglow)" />
        <path d={line} fill="none" stroke={LIME} strokeWidth="2.2" strokeLinecap="round" />
        <line x1={x(shown)} y1={y(series[shown].n)} x2={x(shown)} y2={H} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />
        <circle cx={x(shown)} cy={y(series[shown].n)} r="5" fill="#16201a" stroke={LIME} strokeWidth="2.5" />
      </svg>
      <div className="flex justify-between text-[11px] text-zinc-500 px-1">{ticks.map(k => <span key={k}>{k === series.length - 1 ? "Today" : nice(series[k].day)}</span>)}</div>
    </div>
  );
}

function Sources({ stats }: { stats: Stats }) {
  // (signs and search engines together; each named link and each other website its own row)
  const rows = useMemo(() => {
    const out = new Map<string, { icon: React.ReactNode; name: string; n: number; note?: string }>();
    const add = (k: string, icon: React.ReactNode, name: string, n: number, note?: string) => {
      const r = out.get(k);
      if (r) r.n += n;
      else out.set(k, { icon, name, n, note });
    };
    const webs = stats.sources.filter(s => s.source === "web");
    for (const s of stats.sources) {
      if (s.source === "sign") add("sign", <QrCode size={16} />, "Tee sign QR codes", s.n);
      else if (s.source === "link") add(`link:${s.label}`, <Link2 size={16} />, s.label ? `"${s.label}" link` : "A public link", s.n);
      else if (s.source === "search") add("search", <Search size={16} />, "Search engines", s.n);
      else if (s.source === "web") add("web", <Globe size={16} />, webs.length === 1 && s.key ? s.key : "Other websites", s.n, webs.length > 1 ? webs.slice(0, 3).map(w => w.key).join(", ") : undefined);
      else add("direct", <ArrowRight size={16} />, "Typed in or shared", s.n);
    }
    return [...out.values()].sort((a, b) => b.n - a.n);
  }, [stats]);
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <div className={card} data-testid="visitors-sources">
      <div className={head}>How they found it</div>
      <div className="mt-1">
        {rows.map((r, i) => (
          <div key={r.name} className={`flex items-center gap-2.5 py-2 ${i ? "border-t border-white/[0.07]" : ""}`}>
            <span className="w-[30px] h-[30px] rounded-[10px] bg-white/[0.07] text-zinc-100 flex items-center justify-center shrink-0">{r.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-zinc-50 truncate">{r.name}</div>
              {r.note && <div className="text-[11.5px] text-zinc-500 truncate">{r.note}</div>}
              <div className="h-[5px] rounded-full bg-white/[0.07] mt-1.5 overflow-hidden"><i className="block h-full rounded-full bg-gradient-to-r from-[#6f9a4a] to-[#a2cf6a]" style={{ width: `${(r.n / total) * 100}%` }} /></div>
            </div>
            <div className="text-[14px] font-bold text-zinc-50 tabular-nums">{Math.round((r.n / total) * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Each hole's tee sign by how often its QR code was scanned: brighter, more. */
function Signs({ stats }: { stats: Stats }) {
  const doc = useCourse(s => s.doc);
  const by = new Map(stats.sources.filter(s => s.source === "sign" && s.key).map(s => [s.key!, s.n]));
  if (!by.size) return null;
  const labels = doc.holes.map(h => holeLabel(doc, h.id));
  for (const k of by.keys()) if (!labels.includes(k)) labels.push(k);
  const max = Math.max(1, ...by.values());
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <div className={card} data-testid="visitors-signs">
      <div className={head}>Tee signs scanned</div>
      <p className="text-[13.5px] text-zinc-300 mt-1.5">Most scanned: {top.map(([k], i) => <span key={k}>{i ? " and " : ""}<b className="text-zinc-50">hole {k}</b></span>)}.</p>
      <div className="grid grid-cols-6 gap-1.5 mt-3">
        {labels.map(k => {
          const n = by.get(k) ?? 0, a = 0.1 + 0.9 * (n / max), dark = a > 0.6;
          return (
            <div key={k} className="aspect-square rounded-[12px] flex flex-col items-center justify-center text-[11px]" style={{ background: `rgba(162,207,106,${a.toFixed(2)})`, color: dark ? "#14200f" : "rgba(255,255,255,.7)" }} title={`Hole ${k}: ${n} scans`}>
              <b className="text-[17px] leading-none font-semibold" style={{ ...num, color: dark ? "#14200f" : "#fff" }}>{k}</b>{n}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mt-2.5"><span>Fewer</span><span className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-[#a2cf6a]/10 to-[#a2cf6a]" /><span>More</span></div>
    </div>
  );
}

function Holes({ stats, doc }: { stats: Stats; doc: ReturnType<typeof useCourse.getState>["doc"] }) {
  const facts = useMemo(() => {
    const st = courseStats(doc), out = new Map<string, string>();
    doc.holes.forEach((h, k) => out.set(holeLabel(doc, h.id), h.name || (st[k]?.complete ? `Par ${st[k].par} · ${fmtDist(st[k].length, doc.units)}` : "")));
    return out;
  }, [doc]);
  // (looked at: opened on the page, stood on or flown over)
  const by = new Map<string, number>();
  for (const h of stats.holes) by.set(h.hole, (by.get(h.hole) ?? 0) + h.n);
  for (const f of stats.flyovers) by.set(f.hole, (by.get(f.hole) ?? 0) + f.n);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!rows.length) return null;
  const max = rows[0][1];
  const flights = new Map(stats.flyovers.map(f => [f.hole, f.n]));
  return (
    <div className={card} data-testid="visitors-holes">
      <div className={head}>Holes looked at most</div>
      <div className="mt-1">
        {rows.map(([k, n], i) => (
          <div key={k} className={`flex items-center gap-2.5 py-2 ${i ? "border-t border-white/[0.07]" : ""}`}>
            <span className="w-[30px] h-[30px] rounded-[10px] bg-[#1d4ed8] text-white flex items-center justify-center shrink-0 font-semibold" style={num}>{k}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-zinc-50 truncate">{facts.get(k) || `Hole ${k}`}{flights.get(k) ? <span className="text-zinc-400 font-normal"> · {flights.get(k)} flyovers</span> : null}</div>
              <div className="h-[5px] rounded-full bg-white/[0.07] mt-1.5 overflow-hidden"><i className="block h-full rounded-full bg-gradient-to-r from-[#6f9a4a] to-[#a2cf6a]" style={{ width: `${(n / max) * 100}%` }} /></div>
            </div>
            <div className="text-[14px] font-bold text-zinc-50 tabular-nums">{n}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** When they come: the day of the week by the time of day (their own), brighter, busier. */
function Heat({ stats }: { stats: Stats }) {
  const grid = ROWS.map(d => COLS.map((_, c) => stats.heat.filter(h => h.dow === d && Math.floor(h.hour / 3) === c).reduce((a, h) => a + h.n, 0)));
  const max = Math.max(1, ...grid.flat());
  let best = { d: 0, c: 0, n: -1 };
  grid.forEach((row, r) => row.forEach((n, c) => { if (n > best.n) best = { d: ROWS[r], c, n }; }));
  // (the busiest hour inside the busiest stretch)
  const hours = stats.heat.filter(h => h.dow === best.d && Math.floor(h.hour / 3) === best.c).sort((a, b) => b.n - a.n);
  const peak = hours[0]?.hour ?? best.c * 3;
  const part = peak < 12 ? "mornings" : peak < 17 ? "afternoons" : "evenings";
  return (
    <div className={card} data-testid="visitors-heat">
      <div className={head}>When they visit</div>
      <div className="grid gap-[3px] mt-3 text-[10.5px] text-zinc-500" style={{ gridTemplateColumns: "30px repeat(8, 1fr)" }}>
        <span />
        {COLS.map(c => <span key={c} className="text-center">{c}</span>)}
        {grid.map((row, r) => [
          <span key={`d${r}`} className="self-center">{DOW[ROWS[r]]}</span>,
          ...row.map((n, c) => <span key={`${r}:${c}`} className="h-5 rounded-[5px]" style={{ background: `rgba(162,207,106,${(0.07 + (n / max) * 0.93).toFixed(2)})` }} title={`${DOW_LONG[ROWS[r]]}, ${COLS[c]}: ${n}`} />)
        ])}
      </div>
      {best.n > 0 && <p className="text-[13.5px] text-zinc-300 mt-2.5">Busiest: <b className="text-zinc-50">{DOW_LONG[best.d]} {part}</b>, around {ampm(peak)}.</p>}
    </div>
  );
}
