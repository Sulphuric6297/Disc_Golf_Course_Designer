// On site: the screen for re-creating a hole by walking it (state/onSite). The 3D view stands where
// the GPS says and turns as the phone does; the map from above is in its corner, or the whole
// screen. Solid cards and big buttons, for the sun and one hand; the screen stays on.
import { useEffect, useRef } from "react";
import { Footprints, Map as MapIcon, Navigation, X } from "lucide-react";
import { STAND_HERE, TEE_LEVELS } from "../constants";
import { holeBaskets, holeLabel, holeTees } from "../lib/course";
import { courseStats } from "../lib/holeStats";
import { fmtDist } from "../lib/units";
import { updateHole, useCourse, useEditor } from "../state/course";
import { setFollow, useGps } from "../state/gps";
import { ON_SITE_STEPS, goStep, leaveOnSite, mandoHere, nextHole, pinNext, pinsSet, setOnSite, setSpot, startOnSite, startWalking, stopWalking, sureness, useOnSite, walkReading, walkedLength } from "../state/onSite";
import { canShowLocation } from "../state/gps";
import { FOCUS, HelpLink } from "./ui";
import { useTouch } from "./useLayout";

const SURE = { good: { dot: "bg-[#34c759]", word: "Good" }, fair: { dot: "bg-[#ffcc00]", word: "Fair" }, weak: { dot: "bg-[#ff453a]", word: "Weak" }, none: { dot: "bg-zinc-500", word: "Looking for you" } } as const;
const TITLE = { start: "On site", tee: "Tee", pin: "Pins", fairway: "Fairway", finish: "Done" } as const;

const big = "w-full h-[58px] rounded-[18px] flex items-center justify-center gap-2.5 text-[17px] font-extrabold active:scale-[.99] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300";
const chip = "flex-1 min-h-[44px] px-2 rounded-[14px] bg-white/[0.08] border border-white/10 text-[13.5px] font-bold text-zinc-100 active:bg-white/[0.16] flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300";

/** The ring that fills while holding still. */
const Ring = ({ n, of }: { n: number; of: number }) => (
  <span className="w-[30px] h-[30px] rounded-full shrink-0" aria-hidden
    style={{ background: `conic-gradient(#fff 0 ${(n / of) * 360}deg, rgba(255,255,255,.3) ${(n / of) * 360}deg 360deg)`, WebkitMask: "radial-gradient(circle, transparent 10px, #000 11px)", mask: "radial-gradient(circle, transparent 10px, #000 11px)" }} />
);

/** How sure the GPS is now, as a color and in feet (and a word on the right). */
function Sure({ right }: { right?: string }) {
  const fix = useGps(g => g.fix);
  const units = useCourse(s => s.doc.units);
  // (a phone standing still may not send a reading for a while: one from the last minute counts)
  const stale = !fix || Date.now() - fix.time > 60_000;
  const k = sureness(stale ? null : fix.acc);
  return (
    <div className="flex items-center gap-2 text-[13px] font-bold mb-2.5" data-testid="onsite-sure" data-sure={k}>
      <span className={`w-3 h-3 rounded-full ${SURE[k].dot}`} />{SURE[k].word}{k !== "none" && fix ? ` · ± ${fmtDist(fix.acc, units)}` : "…"}
      {right && <span className="ml-auto text-zinc-400 font-semibold">{right}</span>}
    </div>
  );
}

/** The 3D view where you stand: moved once you've walked a few feet, turned once the phone has
 * turned a little (so the GPS's jitter doesn't make it swim). */
function useFollow() {
  const on = useOnSite(s => s.on);
  const fix = useGps(g => g.fix);
  const facing = useGps(g => g.facing);
  const last = useRef<{ x: number; y: number; face?: number } | null>(null);
  const holeId = on?.holeId ?? null, map = !!on?.map, turn = !!on?.turn;
  useEffect(() => {
    if (!on) return;
    if (map) {
      last.current = null;
      useEditor.getState().set({ teeView: null, teeStand: null });
      setFollow(true);
      return;
    }
    if (!fix) {
      // (no reading yet: on the hole's tee, if it has one)
      if (holeId && useEditor.getState().teeView !== holeId) useEditor.getState().set({ teeView: holeId, teeStand: null, flyover: false });
      return;
    }
    // (the way the phone faces, on the plan: north is up the page, -y)
    const face = turn && facing !== null ? Math.atan2(-Math.cos((facing * Math.PI) / 180), Math.sin((facing * Math.PI) / 180)) : last.current?.face;
    const l = last.current;
    const moved = !l || Math.hypot(l.x - fix.at.x, l.y - fix.at.y) > 3;
    const turned = face !== undefined && (l?.face === undefined || Math.abs(Math.atan2(Math.sin(face - l.face), Math.cos(face - l.face))) > 0.17);
    const view = holeId ?? STAND_HERE;
    if (!moved && !turned && useEditor.getState().teeView === view) return;
    last.current = { x: fix.at.x, y: fix.at.y, face };
    useEditor.getState().set({ teeView: view, teeStand: { x: fix.at.x, y: fix.at.y, ...(face !== undefined ? { face } : {}) }, flyover: false });
  }, [on?.step, holeId, map, turn, fix, facing]);
  // (walking a line: each reading)
  const walking = !!on?.walking;
  useEffect(() => { if (walking && fix) walkReading(fix.at, fix.raw); }, [walking, fix]);
}

/** The way into on site: a hole's (walk it again) or a new one's. Only on a phone or tablet, on a
 * site placed on the earth, where the browser can say where it is. `row`: the holes list's look. */
export function OnSiteButton({ holeId = null, row = false, className = "" }: { holeId?: string | null; row?: boolean; className?: string }) {
  const touch = useTouch();
  const readOnly = useCourse(s => s.readOnly);
  useCourse(s => !!s.doc.site.bounds);
  if (!touch || readOnly || !canShowLocation()) return null;
  const go = () => startOnSite(holeId);
  if (row) return (
    <button data-testid="onsite-new" onClick={go} className={`w-full flex items-center gap-2 rounded-[14px] px-2 py-1.5 touch:min-h-[44px] text-[12.5px] font-semibold text-sky-300 ${FOCUS}`}>
      <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-sky-500/90 text-white"><Footprints size={13} /></span>On site: walk a new hole
    </button>
  );
  return (
    <button data-testid={holeId ? "onsite-hole" : "onsite-new"} onClick={go} className={`h-11 px-4 rounded-full bg-sky-500/90 text-white text-[14px] font-bold flex items-center justify-center gap-2 active:bg-sky-600 ${FOCUS} ${className}`}>
      <Footprints size={16} />{holeId ? "Walk it on site" : "On site: walk a new hole"}
    </button>
  );
}

export function OnSite() {
  const on = useOnSite(s => s.on);
  const doc = useCourse(s => s.doc);
  useFollow();
  if (!on) return null;
  const u = doc.units;
  const hole = on.holeId ? doc.holes.find(h => h.id === on.holeId) : null;
  const label = hole ? `Hole ${holeLabel(doc, hole.id)}` : "New hole";
  const stepAt = ON_SITE_STEPS.indexOf(on.step);
  const holding = on.holding;
  const tees = hole ? holeTees(doc, hole.id) : [];
  const pins = hole ? holeBaskets(doc, hole.id) : [];
  const s = hole ? courseStats(doc).find(x => x.holeId === hole.id) : undefined;
  const fixAt = useGps.getState().fix?.at;
  const teeAt = on.teeAt ?? tees[0] ?? null;
  const fromTee = teeAt && fixAt ? fmtDist(Math.hypot(fixAt.x - teeAt.x, fixAt.y - teeAt.y), u) : undefined;
  const hold = (what: "tee" | "pin", text: string) => (
    <button className={`${big} bg-[#0a84ff] text-white`} disabled={!!holding} onClick={() => void setSpot(what)} data-testid="onsite-set">
      {holding ? <><Ring n={holding.n} of={holding.of} />Hold still · {holding.n} of {holding.of}</> : text}
    </button>
  );
  const walkButton = (kind: "fairway" | "ob", text: string) => on.walking?.kind === kind
    ? <button className={`${big} bg-[#ef4444] text-white`} onClick={stopWalking} data-testid="onsite-walk"><span className="w-3 h-3 rounded-full bg-white" />Recording · {fmtDist(walkedLength(), u)} · Stop</button>
    : <button className={`${big} ${kind === "fairway" ? "bg-[#ef4444] text-white" : "bg-white/[0.12] text-zinc-50"}`} disabled={!!on.walking} onClick={() => startWalking(kind)} data-testid={kind === "fairway" ? "onsite-walk" : "onsite-ob"}><Footprints size={20} />{text}</button>;

  let card: React.ReactNode = null;
  if (on.step === "start") {
    const has = tees.length + pins.length > 0;
    card = (
      <>
        <div className="text-[12px] font-extrabold tracking-wide text-[#a6d36b]">{label.toUpperCase()} · ON SITE</div>
        <h3 className="text-[18px] font-bold leading-tight mt-0.5">Walk it to put it on the map</h3>
        <ol className="my-2.5 grid gap-1.5 text-[13.5px]">
          {["Tees: stand on each pad", "Pins: stand at each basket", "Fairway: walk the line (or skip)", "Par, mandos and OB"].map((t, i) => (
            <li key={t} className="flex items-center gap-2.5"><span className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[12px] font-extrabold">{i + 1}</span>{t}</li>
          ))}
        </ol>
        <Sure right="Screen stays on" />
        <button className={`${big} bg-[#a6d36b] text-[#11180f]`} onClick={() => goStep("tee")} data-testid="onsite-start">Start at the tee</button>
        {has && (
          <div className="flex gap-2 mt-2">
            <button className={chip} onClick={() => goStep("tee")} data-testid="onsite-keep">Keep this hole's spots</button>
            <button className={chip} onClick={() => { startOnSite(hole!.id, true); goStep("tee"); }} data-testid="onsite-fresh">Start fresh</button>
          </div>
        )}
      </>
    );
  } else if (on.step === "tee") {
    const more = on.done.some(id => tees.some(t => t.id === id));
    card = (
      <>
        <h3 className="text-[18px] font-bold leading-tight">{more ? "Another tee: stand at the front middle of its pad" : "Stand at the front middle of the pad"}</h3>
        <p className="text-[13px] text-zinc-300 mt-1 mb-2.5">Out from under the trees if you can. Hold the phone still at your chest.</p>
        <Sure />
        {hold("tee", "Set tee here")}
        <div className="flex gap-2 mt-2">
          <button className={chip} onClick={() => setOnSite({ map: true })} data-testid="onsite-on-map">Place it on the map</button>
          {(hole && tees.length > 0) && <button className={chip} onClick={() => goStep("pin")} data-testid="onsite-skip">{more ? "No more tees" : "Keep the tee"}</button>}
        </div>
      </>
    );
  } else if (on.step === "pin") {
    const next = pinNext(), set = pinsSet();
    card = (
      <>
        <h3 className="text-[18px] font-bold leading-tight">{next ? `Pin ${next}: stand at the basket pole` : "Pins A to D are set"}</h3>
        <p className="text-[13px] text-zinc-300 mt-1 mb-2.5">{set.length ? `Pin ${set.join(", ")} set. Another pin position, or on to the fairway.` : "Walk to the basket. Your line from the tee is on the map as you go."}</p>
        <Sure right={fromTee ? `${fromTee} from the tee` : undefined} />
        {set.length && !holding
          ? <button className={`${big} bg-[#a6d36b] text-[#11180f]`} onClick={() => goStep("fairway")} data-testid="onsite-next-step">Next: the fairway</button>
          : next ? hold("pin", `Set pin ${next} here`) : null}
        <div className="flex gap-2 mt-2">
          {set.length > 0 && next ? <button className={chip} disabled={!!holding} onClick={() => void setSpot("pin")} data-testid="onsite-another-pin">+ Pin {next}</button>
            : <button className={chip} onClick={() => setOnSite({ map: true })} data-testid="onsite-on-map">Place it on the map</button>}
          {hole && <button className={chip} onClick={() => goStep("tee")} data-testid="onsite-another-tee">+ Another tee</button>}
          {hole && !set.length && pins.length > 0 && <button className={chip} onClick={() => goStep("fairway")} data-testid="onsite-skip">Keep the pins</button>}
        </div>
      </>
    );
  } else if (on.step === "fairway") {
    card = (
      <>
        <h3 className="text-[18px] font-bold leading-tight">Walk where the disc should fly</h3>
        <p className="text-[13px] text-zinc-300 mt-1 mb-2.5">From the tee toward the basket. Bends you walk become the hole's doglegs; the wiggles are smoothed out.</p>
        {walkButton("fairway", "Start walking the line")}
        <div className="flex gap-2 mt-2">
          {on.walking ? <button className={chip} onClick={() => startWalking("fairway")} data-testid="onsite-restart">Start over</button>
            : <>
              <button className={chip} onClick={() => { if (hole) updateHole(hole.id, { doglegs: [] }); goStep("finish"); }} data-testid="onsite-straight">Straight, skip</button>
              {hole && hole.doglegs.length > 0 && <button className={chip} onClick={() => goStep("finish")} data-testid="onsite-skip">Keep its bends</button>}
            </>}
        </div>
      </>
    );
  } else {
    const auto = s?.parAuto ?? 3, par = hole?.par ?? auto;
    const nextNo = hole ? doc.holes.findIndex(h => h.id === hole.id) + 1 : -1;
    const nextLabel = nextNo > 0 && nextNo < doc.holes.length ? `hole ${holeLabel(doc, doc.holes[nextNo].id)}` : "a new hole";
    card = (
      <>
        <h3 className="text-[18px] font-bold leading-tight">{label} is on the map</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] my-2" data-testid="onsite-facts">
          <span className="text-zinc-400">Length</span><b>{s?.complete ? fmtDist(s.length, u) : "–"}</b>
          <span className="text-zinc-400">Pins</span><b>{pins.map(b => b.position).join(", ") || "–"}</b>
          <span className="text-zinc-400">Tees</span><b>{tees.map(t => TEE_LEVELS[t.level].label).join(", ") || "–"}</b>
          <span className="text-zinc-400">Bends</span><b>{hole?.doglegs.length ?? 0}</b>
        </div>
        <div className="text-[12px] font-bold text-zinc-400 mb-1.5">PAR</div>
        <div className="flex gap-2 mb-2" role="radiogroup" aria-label="Par">
          {[2, 3, 4, 5].map(p => (
            <button key={p} role="radio" aria-checked={par === p} className={`${chip} ${par === p ? "!bg-zinc-100 !text-zinc-900" : ""}`} onClick={() => hole && updateHole(hole.id, { par: p === auto ? undefined : p })} data-testid={`onsite-par-${p}`}>{p}</button>
          ))}
        </div>
        {on.walking?.kind === "ob" ? walkButton("ob", "") : (
          <div className="flex gap-2">
            <button className={chip} onClick={() => startWalking("ob")} data-testid="onsite-ob">Walk an OB line</button>
            <button className={chip} disabled={!!holding} onClick={() => void mandoHere()} data-testid="onsite-mando">{holding ? `Hold still · ${holding.n} of ${holding.of}` : "Mando here"}</button>
          </div>
        )}
        <button className={`${big} bg-[#a6d36b] text-[#11180f] mt-2.5`} onClick={nextHole} data-testid="onsite-next">Next: {nextLabel} →</button>
      </>
    );
  }

  return (
    <div className="absolute inset-0 z-30 pointer-events-none text-zinc-50" data-testid="onsite" data-step={on.step}>
      {/* (the top: what's being walked, the steps, and the way out) */}
      <div className="absolute left-2 right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto">
        <div className="h-[52px] rounded-[18px] bg-[#101611]/95 border border-white/10 flex items-center gap-2 pl-3 pr-2 shadow-xl">
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold flex items-center gap-1.5" data-testid="onsite-title">{label} · {TITLE[on.step]}<HelpLink topic="on-site" label="On site" /></div>
            <div className="text-[11.5px] font-semibold text-zinc-400">{stepAt >= 0 ? `Step ${stepAt + 1} of ${ON_SITE_STEPS.length}` : "Walk the hole to put it on the map"}</div>
          </div>
          <button className="ml-auto w-11 h-11 rounded-[12px] bg-white/[0.08] grid place-items-center active:bg-white/15" aria-label="Leave on site" onClick={leaveOnSite} data-testid="onsite-close"><X size={20} /></button>
        </div>
        {stepAt >= 0 && (
          <div className="flex gap-1 px-1.5 mt-2" aria-hidden>
            {ON_SITE_STEPS.map((st, i) => <i key={st} className={`flex-1 h-[5px] rounded-full ${i < stepAt ? "bg-[#a6d36b]" : i === stepAt ? "bg-[#a6d36b]/70" : "bg-white/15"}`} />)}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <button className="h-9 px-3 rounded-[12px] bg-[#101611]/95 border border-white/10 text-[12.5px] font-bold flex items-center gap-1.5" aria-pressed={on.map} onClick={() => setOnSite({ map: !on.map })} data-testid="onsite-map">
            {on.map ? <><Navigation size={14} /> 3D</> : <><MapIcon size={14} /> Map</>}
          </button>
          {!on.map && (
            <button className="h-9 px-3 rounded-[12px] bg-[#101611]/95 border border-white/10 text-[12.5px] font-bold flex items-center gap-2" role="switch" aria-checked={on.turn} onClick={() => setOnSite({ turn: !on.turn })} data-testid="onsite-turn">
              <span className={`w-[30px] h-[18px] rounded-full relative ${on.turn ? "bg-[#a6d36b]" : "bg-white/20"}`}><span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white ${on.turn ? "right-[2px]" : "left-[2px]"}`} /></span>Turn with me
            </button>
          )}
        </div>
      </div>
      {/* (the step's card, at the thumb) */}
      <div className="absolute left-2 right-2 bottom-[max(8px,env(safe-area-inset-bottom))] pointer-events-auto max-w-[520px] mx-auto rounded-[22px] bg-[#121a13] border border-white/10 px-3.5 pt-3.5 pb-3 shadow-[0_-8px_26px_rgba(0,0,0,.45)]" data-testid="onsite-card">
        {card}
      </div>
    </div>
  );
}
