// On the course with a tablet: a tee, basket or anything else put where you stand. Its position
// is read for a few seconds, the weak readings dropped and the rest averaged (each by how sure it
// is), then the item is moved there in one step. (A phone has Move here on its strip instead, and
// a computer isn't carried round the course.)
import { useEffect, useRef, useState } from "react";
import { LocateFixed, X } from "lucide-react";
import { geoRefOf, toPlanXY } from "../lib/geoRef";
import { fmtDist } from "../lib/units";
import { updateItem, useCourse } from "../state/course";
import type { CourseItem, P } from "../types";
import { getView } from "../state/view";
import { Button } from "./ui";
import { useLayout, useTouch } from "./useLayout";

/** How long to listen, and the most readings kept. */
const LISTEN_MS = 10_000, MOST = 20;
const FT_PER_M = 3.28084;

type Fix = { lat: number; lon: number; acc: number };

/** The readings averaged: the weak ones (much less sure than the best) left out, the rest weighted
 * by 1/accuracy² (the standard way to combine independent estimates). Accuracy in meters. */
export const averageFixes = (fixes: Fix[]) => {
  if (!fixes.length) return null;
  const best = Math.min(...fixes.map(f => f.acc));
  const kept = fixes.filter(f => f.acc <= Math.max(5, best * 2));
  let w = 0, lat = 0, lon = 0;
  for (const f of kept) { const k = 1 / (f.acc * f.acc); w += k; lat += f.lat * k; lon += f.lon * k; }
  return { lat: lat / w, lon: lon / w, acc: Math.max(best * 0.6, 1 / Math.sqrt(w)), n: kept.length };
};

/** Whether this phone can say where it is, on this site. */
export const canLocate = (doc: Parameters<typeof geoRefOf>[0]) =>
  typeof navigator !== "undefined" && "geolocation" in navigator && typeof window !== "undefined" && window.isSecureContext && !!geoRefOf(doc);

/** `inline`: inside another panel's row (no margin of its own). */
export function PlaceByGps({ item, inline = false }: { item: Extract<CourseItem, { x: number; y: number }>; inline?: boolean }) {
  const doc = useCourse(s => s.doc);
  const units = doc.units;
  const touch = useTouch();
  const phone = useLayout() === "phone";
  const [fixes, setFixes] = useState<Fix[] | null>(null);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(0);
  const watch = useRef<number | null>(null);
  const stop = () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; };
  useEffect(() => stop, []);
  // (another item picked: start over)
  useEffect(() => { stop(); setFixes(null); setError(""); }, [item.id]);
  const ref = geoRefOf(doc);
  if (!touch || phone || !canLocate(doc) || !ref) return null;
  const start = () => {
    setError(""); setFixes([]);
    const t0 = Date.now();
    watch.current = navigator.geolocation.watchPosition(
      p => {
        setFixes(f => {
          const next = [...(f ?? []), { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }].slice(-MOST);
          return next;
        });
        const remaining = Math.max(0, LISTEN_MS - (Date.now() - t0));
        setLeft(remaining);
        if (remaining <= 0) stop();
      },
      e => { stop(); setFixes(null); setError(e.code === e.PERMISSION_DENIED ? "Location is off for this site. Allow it in the browser's settings." : "Couldn't find where you are. Try in the open, away from buildings."); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );
    window.setTimeout(stop, LISTEN_MS + 500);
  };
  const avg = fixes?.length ? averageFixes(fixes) : null;
  const at: P | null = avg ? toPlanXY(ref, avg.lat, avg.lon) : null;
  const off = at ? Math.hypot(at.x - item.x, at.y - item.y) : 0;
  const listening = watch.current !== null;
  const place = () => {
    if (!at) return;
    updateItem(item.id, { x: at.x, y: at.y } as Partial<CourseItem>);
    getView()?.fitBounds({ minX: at.x - 60, minY: at.y - 60, maxX: at.x + 60, maxY: at.y + 60 });
    stop(); setFixes(null);
  };
  return (
    <div className={`${inline ? "mb-2" : "mx-4 mb-3"} rounded-[16px] bg-white/[0.06] p-3`} data-testid="place-by-gps">
      {fixes === null ? (
        <>
          <Button small full onClick={start} testid="gps-start" title="Move it to where you're standing"><LocateFixed size={15} /> Move it here</Button>
          {error && <p role="alert" className="text-[12px] text-red-300 mt-1.5">{error}</p>}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-semibold text-zinc-100">{listening ? "Hold still on the spot…" : "Your spot"}</span>
            <button className="p-1 rounded-full text-zinc-400 hover:text-zinc-50" aria-label="Cancel" onClick={() => { stop(); setFixes(null); }}><X size={15} /></button>
          </div>
          <div className="text-[12px] text-zinc-400 tabular-nums" data-testid="gps-status">
            {avg ? `Within ${fmtDist(avg.acc * FT_PER_M, units)} · ${avg.n} reading${avg.n === 1 ? "" : "s"}` : "Finding you…"}
            {listening && left > 0 ? ` · ${Math.ceil(left / 1000)} s` : ""}
            {at ? ` · ${fmtDist(off, units)} from where it is` : ""}
          </div>
          {listening && <div className="mt-2 h-1.5 rounded-full bg-white/[0.1] overflow-hidden"><div className="h-full bg-orange-400 transition-[width] duration-300" style={{ width: `${100 - (left / LISTEN_MS) * 100}%` }} /></div>}
          {at && <div className="mt-2"><Button small full tone="primary" onClick={place} testid="gps-place">Move it</Button></div>}
        </>
      )}
    </div>
  );
}
