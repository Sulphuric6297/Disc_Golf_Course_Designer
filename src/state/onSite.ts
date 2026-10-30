// On site: re-creating a hole by walking it, with the phone. It goes in the order you'd walk it:
// the tees (stand on each pad), the pins (stand at each basket: A, then B, C, D), the fairway's
// line (walked, its bends kept), then par, mandos and OB lines. Each spot is several GPS readings
// averaged while you hold still; how sure it is shows as a color, and a weak one can still be set
// (it's marked rough in what's said). The 3D view stands where you are (components/OnSite).
import { create } from "zustand";
import { PIN_POSITIONS, STAND_HERE, TEE_ORDER } from "../constants";
import { createBasket, createLine, createTee, holeBaskets, holeTees, holeLabel } from "../lib/course";
import { courseStats } from "../lib/holeStats";
import { pathLength, simplify } from "../lib/geom";
import type { BasketItem, CourseItem, P, TeeItem } from "../types";
import { addHole, placeAt } from "./actions";
import { changeDoc, getDoc, updateHole, useEditor } from "./course";
import { startLocation, useGps, WEAK_FT } from "./gps";
import { toast } from "./toast";

export type OnSiteStep = "start" | "tee" | "pin" | "fairway" | "finish";
/** The steps, in order, after the start (the bar along the top). */
export const ON_SITE_STEPS: OnSiteStep[] = ["tee", "pin", "fairway", "finish"];

type OnSite = {
  /** The hole being walked (null: a new one, made once its tee and first pin are set). */
  holeId: string | null;
  step: OnSiteStep;
  /** A new hole's tee, set before its pin (the hole is made with both). */
  teeAt: P | null;
  /** The tees and pins set this time (the rest of the hole's are next in line to be moved). */
  done: string[];
  /** Walking a line: the hole's fairway or an OB line, the spots so far. */
  walking: { kind: "fairway" | "ob"; pts: P[] } | null;
  /** Holding still for a spot: readings taken of how many. */
  holding: { n: number; of: number } | null;
  /** The map from above instead of the 3D view. */
  map: boolean;
  /** The 3D view turns as the phone does (its compass). */
  turn: boolean;
};

export const useOnSite = create<{ on: OnSite | null }>(() => ({ on: null }));
const set = (patch: Partial<OnSite>) => useOnSite.setState(s => (s.on ? { on: { ...s.on, ...patch } } : s));
export const onSiteNow = () => useOnSite.getState().on;

/** How sure a spot is, from its accuracy (ft): green, amber or red, as field apps show it. */
export const sureness = (acc: number | null) => (acc === null ? "none" : acc <= 10 ? "good" : acc <= 25 ? "fair" : "weak") as "none" | "good" | "fair" | "weak";

/** Starts on site: a hole (or a new one), its location on, the 3D view where you are. `fresh`:
 * the hole's tees and pins taken off first, to walk it all again. */
export const startOnSite = (holeId: string | null, fresh = false) => {
  startLocation(true);
  if (holeId && fresh) {
    const d = getDoc();
    const gone = new Set([...holeTees(d, holeId), ...holeBaskets(d, holeId)].filter(i => !(i.type === "basket" && i.alsoHoles?.length)).map(i => i.id));
    changeDoc(doc => ({ items: doc.items.filter(i => !gone.has(i.id)), holes: doc.holes.map(h => (h.id === holeId ? { ...h, doglegs: [] } : h)) }));
  }
  useOnSite.setState({ on: { holeId, step: "start", teeAt: null, done: [], walking: null, holding: null, map: false, turn: true } });
  useEditor.getState().set({ tool: "select", selectedId: null, activeHoleId: holeId, teeViewTee: null, flyover: false });
};
export const leaveOnSite = () => {
  useOnSite.setState({ on: null });
  useEditor.getState().set({ teeView: null, teeStand: null, flyover: false });
};
export const goStep = (step: OnSiteStep) => set({ step, walking: null });
export const setOnSite = set;

/** Readings averaged while holding still: `of` of them, half a second apart (a phone sends about
 * one a second; each is the GPS's own running estimate), weighted by how sure each is. Null: no
 * reading came. */
export const holdStill = (of = 6, every = 500) =>
  new Promise<{ at: P; acc: number } | null>(resolve => {
    if (useGps.getState().mode === "off") startLocation(true);
    const got: { at: P; acc: number }[] = [];
    set({ holding: { n: 0, of } });
    let waited = 0;
    const t = window.setInterval(() => {
      const f = useGps.getState().fix;
      waited++;
      // (the latest reading each time: a phone standing still may not send a new one for a while;
      // none yet, or none for a minute: waits up to 20 s for one)
      if (f && Date.now() - f.time < 60_000) got.push({ at: f.at, acc: Math.max(2, f.acc) });
      set({ holding: { n: got.length, of } });
      if (got.length >= of || (!got.length && waited * every > 20_000)) {
        window.clearInterval(t);
        set({ holding: null });
        if (!got.length) return resolve(null);
        let wx = 0, wy = 0, w = 0, acc = 0;
        for (const g of got) { const k = 1 / (g.acc * g.acc); wx += g.at.x * k; wy += g.at.y * k; w += k; acc += g.acc; }
        resolve({ at: { x: wx / w, y: wy / w }, acc: acc / got.length });
      }
    }, every);
  });

const said = (what: string, acc: number) => `${what} set${acc > 25 ? " (rough: fix it on the map later)" : ""}.`;

/** The hole's next tee or pin to put where you stand: one of its own not set yet this time
 * (moved), else a new one in the first color or letter free. Null: all six colors, or A to D. */
const nextOf = <T extends TeeItem | BasketItem>(mine: T[], done: string[]) => mine.find(i => !done.includes(i.id)) ?? null;

/** The spot held still for, as the step's tee or pin. */
export const setSpot = async (what: "tee" | "pin") => {
  const on = onSiteNow();
  if (!on || on.holding) return;
  const got = await holdStill();
  const now = onSiteNow();
  if (!now) return;
  if (!got) { toast("No GPS reading came. Try out in the open, or set it on the map.", "info"); return; }
  const d = getDoc();
  if (what === "tee") {
    if (!now.holeId) {
      // (a new hole: its tee kept until its first pin is set)
      set({ teeAt: got.at, step: "pin" });
      toast(said("Tee", got.acc), "success", true);
      return;
    }
    const tees = holeTees(d, now.holeId);
    const own = nextOf(tees, now.done);
    let id: string;
    if (own) {
      id = own.id;
      changeDoc(doc => ({ items: doc.items.map(i => (i.id === own.id ? ({ ...i, x: got.at.x, y: got.at.y } as CourseItem) : i)) }));
    } else {
      const level = TEE_ORDER.find(l => !tees.some(t => t.level === l));
      if (!level) { toast(`Hole ${holeLabel(d, now.holeId)} has a tee of every color already.`, "info"); return; }
      const t = createTee(now.holeId, got.at, level);
      id = t.id;
      changeDoc(doc => ({ items: [...doc.items, t] }));
    }
    set({ done: [...now.done, id], step: "pin" });
    toast(said("Tee", got.acc), "success", true);
    return;
  }
  // A pin: a new hole made with its tee; else the hole's next pin moved, or another added
  if (!now.holeId) {
    if (!now.teeAt) { goStep("tee"); return; }
    const hole = addHole(now.teeAt, got.at, "blue");
    const made = holeTees(getDoc(), hole.id).map(t => t.id).concat(holeBaskets(getDoc(), hole.id).map(b => b.id));
    set({ holeId: hole.id, teeAt: null, done: made });
    useEditor.getState().set({ activeHoleId: hole.id, selectedId: null });
    toast(`Hole ${holeLabel(getDoc(), hole.id)} made. ${said("Pin A", got.acc)}`, "success", true);
    return;
  }
  const pins = holeBaskets(d, now.holeId);
  const own = nextOf(pins, now.done);
  if (own) {
    changeDoc(doc => ({ items: doc.items.map(i => (i.id === own.id ? ({ ...i, x: got.at.x, y: got.at.y } as CourseItem) : i)) }));
    set({ done: [...now.done, own.id] });
    toast(said(`Pin ${own.position}`, got.acc), "success", true);
    return;
  }
  const position = PIN_POSITIONS.find(p => !pins.some(b => b.position === p));
  if (!position) { toast(`Hole ${holeLabel(d, now.holeId)} has pins A to D already.`, "info"); return; }
  const b = createBasket(now.holeId, got.at, position);
  changeDoc(doc => ({ items: [...doc.items, b] }));
  set({ done: [...now.done, b.id] });
  toast(said(`Pin ${position}`, got.acc), "success", true);
};

/** The pin that a press sets now: the next of the hole's own not set yet, or the next letter. */
export const pinNext = () => {
  const on = onSiteNow();
  if (!on?.holeId) return "A";
  const pins = holeBaskets(getDoc(), on.holeId);
  return nextOf(pins, on.done)?.position ?? PIN_POSITIONS.find(p => !pins.some(b => b.position === p)) ?? null;
};
/** Pins set this time. */
export const pinsSet = () => {
  const on = onSiteNow();
  if (!on?.holeId) return [];
  return holeBaskets(getDoc(), on.holeId).filter(b => on.done.includes(b.id)).map(b => b.position);
};

/** Walking a line: from now, each new spot a few feet on is kept. */
export const startWalking = (kind: "fairway" | "ob") => {
  const f = useGps.getState().fix;
  set({ walking: { kind, pts: f && f.raw <= WEAK_FT ? [f.at] : [] } });
};
/** A reading while walking: kept when it's sure enough and a few feet on from the last. */
export const walkReading = (at: P, raw: number) => {
  const on = onSiteNow();
  const w = on?.walking;
  if (!w || raw > WEAK_FT) return;
  const last = w.pts[w.pts.length - 1];
  if (last && Math.hypot(at.x - last.x, at.y - last.y) < 4) return;
  set({ walking: { ...w, pts: [...w.pts, at] } });
};
export const walkedLength = () => pathLength(onSiteNow()?.walking?.pts ?? []);

/** The walk done: the fairway's bends (the wiggles smoothed out), or an OB line for the hole. */
export const stopWalking = () => {
  const on = onSiteNow();
  const w = on?.walking;
  if (!on || !w) return;
  set({ walking: null });
  if (!on.holeId) return;
  if (w.pts.length < 2) { toast("Too short a walk to keep. Walk the line, then Stop.", "info"); return; }
  const line = simplify(w.pts, 8);
  if (w.kind === "ob") {
    changeDoc(d => ({ items: [...d.items, createLine("ob", line, on.holeId!)] }));
    toast(`OB line set (${Math.round(pathLength(line))} ft).`, "success", true);
    return;
  }
  // (bends well away from the tee and the basket: those ends are the hole's own)
  const s = courseStats(getDoc()).find(x => x.holeId === on.holeId);
  const tee = s?.line[0], basket = s?.line[s.line.length - 1];
  const doglegs = line.slice(1, -1).filter(p => (!tee || Math.hypot(p.x - tee.x, p.y - tee.y) > 15) && (!basket || Math.hypot(p.x - basket.x, p.y - basket.y) > 15));
  updateHole(on.holeId, { doglegs });
  toast(doglegs.length ? `Fairway set: ${doglegs.length} ${doglegs.length === 1 ? "bend" : "bends"}.` : "Fairway set: straight.", "success", true);
  goStep("finish");
};

/** A mando where you stand, facing down the hole beside it. */
export const mandoHere = async () => {
  const got = await holdStill();
  if (!got) { toast("No GPS reading came. Try out in the open.", "info"); return; }
  placeAt("add-mando", got.at);
  toast(said("Mando", got.acc), "success", true);
};

/** On to the next hole by number (or a new one after the last). */
export const nextHole = () => {
  const on = onSiteNow();
  if (!on) return;
  const order = getDoc().holes.map(h => h.id);
  const at = on.holeId ? order.indexOf(on.holeId) : -1;
  const next = at >= 0 && at + 1 < order.length ? order[at + 1] : null;
  useOnSite.setState({ on: { ...on, holeId: next, step: "tee", teeAt: null, done: [], walking: null, holding: null } });
  useEditor.getState().set({ activeHoleId: next, teeView: next ?? STAND_HERE });
};
