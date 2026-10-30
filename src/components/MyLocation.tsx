// You on the map: the locate button (tap: show where you are and follow; tap again while following:
// stop; moved the map by hand: tap to follow again), and the dot kept up to date, with how far it is
// to the basket of the hole you're on (the hole picked, or the one you're nearest).
import { useEffect, useRef, useState } from "react";
import { LocateFixed, Navigation } from "lucide-react";
import { distanceToPath } from "../lib/geom";
import { fmtDist } from "../lib/units";
import type { HoleStats } from "../lib/holeStats";
import { useCourse, useEditor } from "../state/course";
import { STALE_MS, WEAK_FT, canShowLocation, setFollow, spotHere, startLocation, stopLocation, useGps } from "../state/gps";
import { getView } from "../state/view";
import { toast } from "../state/toast";
import type { CourseView } from "../viewport/CourseView";

const MI_FT = 5280;

/** The hole you're on: the one picked, else the one whose line you're nearest (within 250 ft). */
const holeHere = (stats: HoleStats[], at: { x: number; y: number }, picked: string | null) => {
  const own = picked ? stats.find(s => s.holeId === picked && s.complete) : undefined;
  if (own) return own;
  let best: HoleStats | undefined, d = 250;
  for (const s of stats) {
    if (!s.complete) continue;
    const k = distanceToPath(at, s.line);
    if (k < d) { d = k; best = s; }
  }
  return best;
};

/** Keeps the map's dot in step with the GPS. */
export function useMyLocation(view: CourseView | null, stats: HoleStats[]) {
  const gps = useGps();
  const units = useCourse(s => s.doc.units);
  const picked = useEditor(e => e.activeHoleId ?? e.selectedId);
  // (a second ticks by: the dot greys once the readings stop)
  const [, tick] = useState(0);
  useEffect(() => {
    if (gps.mode === "off") return;
    const t = window.setInterval(() => tick(n => n + 1), 5000);
    return () => window.clearInterval(t);
  }, [gps.mode]);
  // (moving the map by hand stops it following you)
  useEffect(() => {
    if (!view) return;
    view.onUserMove = () => { if (useGps.getState().mode === "follow") setFollow(false); };
    return () => { view.onUserMove = null; };
  }, [view]);
  // (said once: too far away, or no permission)
  const said = useRef("");
  useEffect(() => {
    const msg = gps.error || (gps.away !== null ? `You're ${gps.away > MI_FT ? `${(gps.away / MI_FT).toFixed(1)} mi` : fmtDist(gps.away, units)} from this course.` : "");
    if (msg && msg !== said.current) toast(msg, gps.error.startsWith("Location is off") ? "error" : "info");
    said.current = msg;
  }, [gps.error, gps.away, units]);
  const fix = gps.fix;
  const old = !!fix && Date.now() - fix.time > STALE_MS;
  const hole = fix && !old ? holeHere(stats, fix.at, picked) : undefined;
  const basket = hole?.line[hole.line.length - 1] ?? null;
  const following = gps.mode === "follow";
  // Drawn: following moves the map only when you've moved (or just started following)
  const lastFollow = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!view) return;
    if (gps.mode === "off" || !fix) { view.setLocation(null); lastFollow.current = null; return; }
    // (holding still for a sure spot: the map left as it is, so nothing else holds the phone up)
    if (gps.settling && view.hasLocation()) return;
    const weak = fix.raw > WEAK_FT;
    const sure = `± ${fmtDist(fix.acc, units)}`;
    const tag = old ? "Looking for you…" : weak ? `Weak signal · ${sure}` : hole && basket ? `${fmtDist(Math.hypot(basket.x - fix.at.x, basket.y - fix.at.y), units)} to the basket · ${hole.label}` : sure;
    const lf = lastFollow.current;
    const go = following && (!lf || Math.hypot(lf.x - fix.at.x, lf.y - fix.at.y) > 3);
    if (go) lastFollow.current = { ...fix.at };
    if (!following) lastFollow.current = null;
    view.setLocation({ at: fix.at, acc: fix.acc, facing: old ? null : gps.facing ?? fix.course ?? null, dim: old || weak, tag, to: !old && !weak && basket ? basket : null }, go);
  });
  // (gone with the map)
  useEffect(() => () => view?.setLocation(null), [view]);
}

/** On the phone's hole tools, once you've shown where you are: the tee, basket or pin put where
 * you're standing (a few seconds still, for a sure spot). */
export function HereButton({ what, className }: { what: "tee" | "basket" | "pin"; className: string }) {
  const mode = useGps(g => g.mode);
  const settling = useGps(g => g.settling);
  const acc = useGps(g => g.fix?.acc ?? null);
  const units = useCourse(s => s.doc.units);
  useCourse(s => !!s.doc.site.bounds);
  if (mode === "off" || !canShowLocation()) return null;
  const go = async () => {
    const f = await spotHere();
    if (!f) { toast("Couldn't get a sure spot. Try again in the open, or tap the map.", "info"); return; }
    if (!getView()?.toolPoint(f.at)) toast(`That's right by the tee. Walk to where the ${what} goes, then tap again.`, "info");
  };
  return (
    <button className={className} onClick={() => void go()} disabled={settling} aria-busy={settling || undefined} data-testid="here-button">
      <Navigation size={16} fill="currentColor" className={settling ? "animate-pulse" : ""} />
      {settling ? <span className="tabular-nums">Hold still{acc !== null ? ` · ± ${fmtDist(acc, units)}` : "…"}</span> : `${what[0].toUpperCase()}${what.slice(1)} here`}
    </button>
  );
}

/** The locate button. `className`: its look, the map controls' own. */
export function LocateButton({ className, size = 18 }: { className: string; size?: number }) {
  const mode = useGps(g => g.mode);
  const has = useGps(g => !!g.fix);
  // (shown once the site is placed on the earth)
  useCourse(s => !!s.doc.site.bounds);
  if (!canShowLocation()) return null;
  const label = mode === "off" ? "Show where I am" : mode === "follow" ? "Stop showing where I am" : "Follow me again";
  return (
    <button className={`${className} ${mode !== "off" ? "!text-sky-400" : ""}`} aria-label={label} title={label} aria-pressed={mode !== "off"} data-testid="locate-me"
      onClick={() => (mode === "off" ? startLocation(true) : mode === "follow" ? stopLocation() : setFollow(true))}>
      {mode === "follow" ? <Navigation size={size - 1} fill="currentColor" className={has ? "" : "animate-pulse"} /> : mode === "show" ? <Navigation size={size - 1} /> : <LocateFixed size={size} />}
    </button>
  );
}
