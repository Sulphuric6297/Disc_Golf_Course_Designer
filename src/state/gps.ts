// Where you are on the course (the phone's GPS), shown as a dot on the map, kept up to date while
// it's on. The readings are smoothed (a small Kalman filter: each new reading counts by how sure it
// is, and the estimate loosens as time passes by how far a walker could have gone), weak readings
// are dropped once there are good ones, the compass points the way you face, and the screen is
// kept awake while the map follows you.
import { create } from "zustand";
import { geoRefOf, toPlanXY } from "../lib/geoRef";
import { getDoc } from "./course";
import type { P } from "../types";

const FT_PER_M = 3.28084;
/** How far a walker's position may wander per second (ft): how fast the estimate loosens. */
const WALK_FT_S = 6;
/** No reading for this long: the dot greys (the position may be old). */
export const STALE_MS = 20_000;
/** Readings less sure than this (ft) count as a weak signal. */
export const WEAK_FT = 65;

export type GpsMode = "off" | "follow" | "show";
export type Fix = {
  /** Where on the plan (ft), smoothed. */
  at: P;
  /** How sure (ft, about one standard deviation): the circle round the dot. */
  acc: number;
  /** The last reading's own accuracy (ft), as the phone said. */
  raw: number;
  /** When the last reading came. */
  time: number;
  /** Moving: the way (degrees from north, clockwise) and speed (ft/s), from the readings. */
  course?: number;
  speed?: number;
};

type Gps = {
  mode: GpsMode;
  /** Waiting, standing still, for a sure spot (a tee or basket put where you stand). */
  settling: boolean;
  fix: Fix | null;
  /** The way the phone faces (degrees from north, clockwise), when it has a compass. */
  facing: number | null;
  error: string;
  /** A reading came but it's well off the site. */
  away: number | null;
};

export const useGps = create<Gps>(() => ({ mode: "off", settling: false, fix: null, facing: null, error: "", away: null }));

/** Where you stand, as sure as a few seconds standing still make it: readings come in until the
 * spot is within `sure` ft (or `ms` pass: the best by then, if it isn't a weak one). Null: none. */
export const spotHere = (sure = 16, ms = 8000) =>
  new Promise<Fix | null>(resolve => {
    if (useGps.getState().mode === "off") startLocation(true);
    const t0 = Date.now();
    useGps.setState({ settling: true });
    const done = (f: Fix | null) => { off(); window.clearInterval(timer); useGps.setState({ settling: false }); resolve(f); };
    const check = () => {
      const { fix, mode } = useGps.getState();
      if (mode === "off") return done(null);
      // (a reading since the wait began, sure enough; the first ones are often the least sure)
      const fresh = fix && fix.time >= t0 ? fix : null;
      if (fresh && fresh.acc <= sure && Date.now() - t0 > 1500) return done(fresh);
      if (Date.now() - t0 > ms) done(fresh && fresh.raw <= WEAK_FT ? fresh : null);
    };
    const off = useGps.subscribe(check);
    const timer = window.setInterval(check, 500);
  });

/** Whether this browser can say where it is (a secure page with location), on a site placed on the earth. */
export const canShowLocation = () =>
  typeof navigator !== "undefined" && "geolocation" in navigator && typeof window !== "undefined" && window.isSecureContext && !!geoRefOf(getDoc());

let watch: number | null = null;
let filter: { x: number; y: number; v: number; t: number } | null = null;
let wake: { release: () => Promise<void> } | null = null;

/** A reading folded into the estimate (plan ft; accuracy ft; time ms). Exported for the tests. */
export const smooth = (prev: typeof filter, z: P, acc: number, t: number) => {
  const r = Math.max(acc, 3) ** 2;
  if (!prev) return { x: z.x, y: z.y, v: r, t };
  const dt = Math.max(0, (t - prev.t) / 1000);
  const v = prev.v + dt * WALK_FT_S * WALK_FT_S;
  // (much less sure than the estimate already is, soon after it: left out)
  if (acc > 3 * Math.sqrt(v) && acc > WEAK_FT && dt < 10) return { ...prev, v, t };
  const k = v / (v + r);
  return { x: prev.x + k * (z.x - prev.x), y: prev.y + k * (z.y - prev.y), v: (1 - k) * v, t };
};

const onReading = (p: GeolocationPosition) => {
  const ref = geoRefOf(getDoc());
  if (!ref) return;
  const z = toPlanXY(ref, p.coords.latitude, p.coords.longitude);
  const acc = p.coords.accuracy * FT_PER_M;
  // (far off the site: said once, not drawn)
  const out = Math.max(-z.x, z.x - ref.width, -z.y, z.y - ref.height, 0);
  if (out > 1500) { useGps.setState({ away: out, fix: null }); filter = null; return; }
  const t = p.timestamp || Date.now();
  filter = smooth(filter, z, acc, t);
  const moving = p.coords.speed != null && p.coords.speed > 0.6;
  useGps.setState({
    away: null, error: "",
    fix: {
      at: { x: filter.x, y: filter.y }, acc: Math.sqrt(filter.v), raw: acc, time: Date.now(),
      course: moving && p.coords.heading != null && !Number.isNaN(p.coords.heading) ? p.coords.heading : undefined,
      speed: p.coords.speed != null ? p.coords.speed * FT_PER_M : undefined
    }
  });
};

const onError = (e: GeolocationPositionError) => {
  if (e.code === e.PERMISSION_DENIED) {
    stopLocation();
    useGps.setState({ error: "Location is off for this site. Allow it in the browser's settings to see yourself on the map." });
  } else if (!useGps.getState().fix) useGps.setState({ error: "Still looking for you: GPS works best in the open, away from buildings and thick trees." });
};

// The compass: iOS gives the heading itself, others an absolute orientation (turned by the screen)
const onOrient = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
  let h: number | null = null;
  if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = (360 - e.alpha + (screen.orientation?.angle ?? 0)) % 360;
  if (h === null) return;
  const was = useGps.getState().facing;
  // (only a change worth drawing)
  if (was === null || Math.abs(((h - was + 540) % 360) - 180) > 2) useGps.setState({ facing: h });
};

const keepAwake = async () => {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (wl && !wake && document.visibilityState === "visible") wake = await wl.request("screen");
  } catch { /* (not allowed: the screen may sleep) */ }
};
const letSleep = () => { void wake?.release().catch(() => undefined); wake = null; };
const onVisible = () => { if (document.visibilityState === "visible" && useGps.getState().mode === "follow") void keepAwake(); else wake = null; };

/** Starts showing where you are (from a tap: the compass may need asking for then). */
export const startLocation = (follow = true) => {
  if (!canShowLocation()) return;
  useGps.setState({ mode: follow ? "follow" : "show", error: "" });
  if (follow) void keepAwake();
  if (watch !== null) return;
  watch = navigator.geolocation.watchPosition(onReading, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 });
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  const listen = () => {
    window.addEventListener("deviceorientationabsolute", onOrient as EventListener);
    window.addEventListener("deviceorientation", onOrient as EventListener);
  };
  if (D?.requestPermission) void D.requestPermission().then(s => { if (s === "granted") listen(); }).catch(() => undefined);
  else listen();
  document.addEventListener("visibilitychange", onVisible);
};

/** Follows you again (the map panned away), or stops following (it keeps showing you). */
export const setFollow = (on: boolean) => {
  if (useGps.getState().mode === "off") return;
  useGps.setState({ mode: on ? "follow" : "show" });
  if (on) void keepAwake(); else letSleep();
};

export const stopLocation = () => {
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  filter = null;
  window.removeEventListener("deviceorientationabsolute", onOrient as EventListener);
  window.removeEventListener("deviceorientation", onOrient as EventListener);
  document.removeEventListener("visibilitychange", onVisible);
  letSleep();
  useGps.setState({ mode: "off", fix: null, facing: null, away: null });
};
