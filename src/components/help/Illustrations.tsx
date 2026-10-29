// The guide's pictures: simple drawings in the app's own colors (woods greys, fern green, pond
// blue, clay), each showing one idea: the steps, a hole's parts, the screens, a flyover, sharing.
import type { ReactNode } from "react";

const C = { bg: "#1b241b", panel: "#263226", line: "rgba(241,243,236,0.16)", text: "#e9ecdf", soft: "#9aa595", fern: "#a2cf6a", pond: "#6fb3d9", clay: "#d9734e", grass: "#4f6b3a", fair: "#7fa35a", sand: "#c9b58a", tee: "#3b82f6", gold: "#facc15" };

const Frame = ({ children, h = 220, label }: { children: ReactNode; h?: number; label: string }) => (
  <svg viewBox={`0 0 560 ${h}`} className="w-full h-auto rounded-[18px]" role="img" aria-label={label} style={{ background: C.bg }}>
    {children}
  </svg>
);
const T = ({ x, y, children, size = 12, color = C.text, anchor = "middle", weight = 600 }: { x: number; y: number; children: ReactNode; size?: number; color?: string; anchor?: "start" | "middle" | "end"; weight?: number }) => (
  <text x={x} y={y} fill={color} fontSize={size} fontWeight={weight} textAnchor={anchor} fontFamily="Inter, system-ui, sans-serif">{children}</text>
);

/** Site → Design → Map → Export. */
export function StepsArt() {
  const steps: [string, string, ReactNode][] = [
    ["1 Site", "The real place", <g key="s"><rect x={-30} y={-22} width={60} height={40} rx={6} fill={C.grass} /><path d="M-30 6 Q-8 -6 10 4 T30 -4" stroke={C.sand} strokeWidth={3} fill="none" /><circle cx={12} cy={-8} r={9} fill={C.pond} opacity={0.85} /><path d="M-6 -16 a7 7 0 1 1 0.1 0 M-6 -9 l0 10" stroke={C.clay} strokeWidth={3} fill="none" /></g>],
    ["2 Design", "Holes and the course", <g key="d"><rect x={-30} y={-22} width={60} height={40} rx={6} fill={C.grass} /><path d="M-20 10 Q0 -20 20 -8" stroke={C.fair} strokeWidth={9} fill="none" strokeLinecap="round" /><rect x={-25} y={6} width={9} height={6} rx={1.5} fill={C.tee} /><circle cx={21} cy={-9} r={4} fill={C.text} /></g>],
    ["3 Map", "Printed map and signs", <g key="m"><rect x={-24} y={-26} width={48} height={48} rx={4} fill={C.text} /><rect x={-19} y={-21} width={38} height={30} rx={2} fill={C.grass} /><path d="M-14 4 Q0 -14 14 -6" stroke={C.fair} strokeWidth={5} fill="none" strokeLinecap="round" /><rect x={-19} y={12} width={22} height={3} rx={1.5} fill={C.soft} /></g>],
    ["4 Export", "Files to print and share", <g key="e"><rect x={-22} y={-24} width={44} height={44} rx={8} fill={C.panel} stroke={C.line} /><path d="M0 -14 V6 M-9 -3 L0 7 L9 -3" stroke={C.fern} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /><rect x={-12} y={11} width={24} height={3} rx={1.5} fill={C.fern} /></g>]
  ];
  return (
    <Frame label="The four steps: Site, Design, Map and Export" h={190}>
      {steps.map(([title, sub, art], i) => {
        const x = 75 + i * 137;
        return (
          <g key={title}>
            <rect x={x - 58} y={22} width={116} height={146} rx={18} fill={C.panel} stroke={C.line} />
            <g transform={`translate(${x} 78)`}>{art}</g>
            <T x={x} y={128} size={14}>{title}</T>
            <T x={x} y={148} size={10} color={C.soft} weight={500}>{sub}</T>
            {i < 3 && <path d={`M${x + 62} 95 l12 0 m-5 -5 l5 5 l-5 5`} stroke={C.fern} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      })}
    </Frame>
  );
}

/** A hole's parts: tee, fairway with a dogleg, mando, OB, basket and its circle, the distance. */
export function HoleArt() {
  return (
    <Frame label="A hole: tee pad, fairway, dogleg, mando, out of bounds, basket and putting circle">
      <rect x={0} y={0} width={560} height={220} fill={C.grass} opacity={0.55} />
      {[40, 90, 470, 520, 500, 60].map((x, i) => <circle key={i} cx={x} cy={i % 2 ? 40 : 190} r={22} fill="#2f4526" />)}
      <path d="M70 160 Q230 165 300 110 T470 70" stroke={C.fair} strokeWidth={46} fill="none" strokeLinecap="round" opacity={0.9} />
      <path d="M70 160 Q230 165 300 110 T470 70" stroke={C.text} strokeWidth={2} strokeDasharray="6 6" fill="none" opacity={0.7} />
      <path d="M150 205 Q300 200 420 150 T560 120" stroke={C.clay} strokeWidth={4} fill="none" />
      <T x={500} y={146} size={11} color={C.clay} weight={700}>OB</T>
      <rect x={52} y={150} width={30} height={18} rx={3} fill={C.tee} transform="rotate(-3 67 159)" />
      <T x={67} y={190} size={11} weight={700}>Tee pad</T>
      <circle cx={470} cy={70} r={34} fill="none" stroke={C.text} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.8} />
      <circle cx={470} cy={70} r={8} fill={C.text} /><circle cx={470} cy={70} r={3.5} fill={C.bg} />
      <T x={470} y={26} size={11} weight={700}>Basket · 10 m circle</T>
      <rect x={296} y={88} width={6} height={22} rx={2} fill={C.gold} />
      <path d="M312 99 l16 0 m-6 -6 l6 6 l-6 6" stroke={C.gold} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <T x={300} y={80} size={11} weight={700} color={C.gold}>Mando</T>
      <rect x={160} y={128} width={86} height={20} rx={6} fill="rgba(15,23,42,0.85)" />
      <T x={203} y={142} size={11} weight={700}>350 ft · P3</T>
      <T x={240} y={186} size={10.5} color={C.text} weight={500}>Dogleg: drag the middle dot</T>
      <path d="M470 70 Q520 30 545 -5" stroke={C.sand} strokeWidth={3} strokeDasharray="5 5" fill="none" />
      <T x={548} y={56} size={10.5} color={C.sand} weight={600} anchor="end">Walk on</T>
    </Frame>
  );
}

/** The Design screen: top bar, holes down the left with the picked thing's panel beside them,
 * tools along the bottom, the View button at the map's top right. */
export function ScreenArt() {
  return (
    <Frame label="The Design screen: top bar, holes column with the panel beside it, map, tool bar and the View button" h={250}>
      <rect x={14} y={12} width={532} height={226} rx={16} fill="#334a2a" />
      <rect x={24} y={20} width={512} height={26} rx={13} fill={C.panel} stroke={C.line} />
      <T x={46} y={37} size={10} anchor="start">Course name</T>
      {["Site", "Design", "Map", "Export"].map((s, i) => <g key={s}><rect x={200 + i * 48} y={24} width={44} height={18} rx={9} fill={i === 1 ? "rgba(255,255,255,0.2)" : "transparent"} /><T x={222 + i * 48} y={37} size={9.5}>{s}</T></g>)}
      <T x={470} y={37} size={9.5} color={C.fern}>Checks · Search</T>
      <rect x={28} y={56} width={82} height={130} rx={12} fill={C.panel} stroke={C.line} />
      {[0, 1, 2, 3].map(i => <g key={i}><circle cx={42} cy={72 + i * 20} r={6} fill={C.tee} /><rect x={54} y={69 + i * 20} width={46} height={6} rx={3} fill={C.soft} /></g>)}
      <T x={69} y={168} size={9} color={C.fern}>+ New hole</T>
      <rect x={28} y={194} width={82} height={34} rx={10} fill={C.panel} stroke={C.line} />
      <T x={69} y={215} size={9}>Totals</T>
      <rect x={118} y={56} width={124} height={140} rx={12} fill={C.panel} stroke={C.line} />
      <T x={180} y={76} size={10}>Panel</T>
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={130} y={88 + i * 18} width={100 - (i % 2) * 24} height={7} rx={3.5} fill={C.soft} opacity={0.7} />)}
      <path d="M300 170 Q380 158 410 118 T500 92" stroke={C.fair} strokeWidth={16} fill="none" strokeLinecap="round" />
      <rect x={270} y={200} width={200} height={28} rx={12} fill={C.panel} stroke={C.line} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <rect key={i} x={282 + i * 23} y={207} width={14} height={14} rx={4} fill={i === 0 ? C.fern : C.soft} opacity={i === 0 ? 1 : 0.6} />)}
      <rect x={496} y={56} width={36} height={24} rx={8} fill={C.panel} stroke={C.fern} />
      <T x={514} y={72} size={9} color={C.fern}>View</T>
      <T x={262} y={100} size={10} color={C.text} anchor="start" weight={500}>The map: pick anything</T>
      <T x={370} y={196} size={9.5} color={C.soft} weight={500}>Tools</T>
    </Frame>
  );
}

/** The Map step: tabs, the panel for the tab, and the page it prints. */
export function MapStepArt() {
  return (
    <Frame label="The Map step: tabs along the top, the panel on the left, the printed page on the right" h={240}>
      <rect x={14} y={12} width={150} height={216} rx={14} fill={C.panel} stroke={C.line} />
      <T x={89} y={34} size={10.5}>Map style</T>
      {[0, 1, 2, 3, 4, 5].map(i => <g key={i}><rect x={26} y={46 + i * 22} width={16} height={16} rx={4} fill={[C.grass, C.fair, C.fair, C.sand, C.pond, C.gold][i]} /><rect x={48} y={51 + i * 22} width={70} height={6} rx={3} fill={C.soft} opacity={0.7} /></g>)}
      <T x={89} y={196} size={10} color={C.soft} weight={500}>Add · Layers</T>
      <rect x={178} y={12} width={368} height={24} rx={12} fill={C.panel} stroke={C.line} />
      {["General", "Course map", "Tee sign", "Hole page", "Card"].map((s, i) => <g key={s}><rect x={186 + i * 71} y={16} width={66} height={16} rx={8} fill={i === 1 ? "rgba(255,255,255,0.2)" : "transparent"} /><T x={219 + i * 71} y={28} size={9}>{s}</T></g>)}
      <rect x={232} y={48} width={262} height={176} rx={6} fill={C.text} />
      <rect x={242} y={58} width={242} height={156} rx={3} fill="#3e5a30" />
      <path d="M262 190 Q330 180 360 140 T450 90" stroke={C.fair} strokeWidth={12} fill="none" strokeLinecap="round" />
      <T x={256} y={84} size={16} anchor="start" weight={800} color="#fff">Ridge Run</T>
      <rect x={410} y={150} width={66} height={56} rx={4} fill="rgba(0,0,0,0.45)" />
      <T x={443} y={166} size={8} color="#fff">HOLE GUIDE</T>
      {[0, 1, 2].map(i => <rect key={i} x={418} y={174 + i * 9} width={50} height={4} rx={2} fill="#ddd" opacity={0.7} />)}
      <path d="M466 68 l6 16 l-6 -4 l-6 4 z" fill="#fff" />
    </Frame>
  );
}

/** A flyover: the camera from behind the tee, along the hole, down to the basket. */
export function FlyArt() {
  return (
    <Frame label="A flyover: the camera starts behind the tee, flies along the hole and comes down to the basket" h={200}>
      <path d="M0 160 Q150 140 280 150 T560 140 L560 200 L0 200 z" fill={C.grass} />
      <path d="M90 162 Q260 150 470 146" stroke={C.fair} strokeWidth={12} fill="none" strokeLinecap="round" />
      <rect x={82} y={156} width={18} height={8} rx={2} fill={C.tee} />
      <rect x={466} y={124} width={4} height={22} fill={C.text} /><ellipse cx={468} cy={128} rx={9} ry={3} fill={C.text} />
      <path d="M40 110 Q120 40 300 50 T460 112" stroke={C.gold} strokeWidth={2.5} strokeDasharray="7 6" fill="none" />
      {[[40, 110], [160, 56], [300, 50], [420, 82]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={6} fill={C.gold} stroke={C.bg} strokeWidth={2} />)}
      <T x={40} y={132} size={10.5} color={C.gold}>Start behind the tee</T>
      <T x={300} y={38} size={10.5} color={C.gold}>Height</T>
      <T x={420} y={70} size={10.5} color={C.gold}>Down to the basket</T>
      <T x={180} y={100} size={10} color={C.soft} weight={500}>Keyframes: the spots it passes</T>
    </Frame>
  );
}

/** Saving and sharing: changed together live, kept, shared with people and on a public page. */
export function ShareArt() {
  const box = (x: number, title: string, sub: string, color: string) => (
    <g>
      <rect x={x} y={52} width={120} height={84} rx={16} fill={C.panel} stroke={color} />
      <T x={x + 60} y={88} size={13} color={color}>{title}</T>
      <T x={x + 60} y={108} size={10} color={C.soft} weight={500}>{sub}</T>
    </g>
  );
  const arrow = (x: number, label: string) => (
    <g>
      <path d={`M${x} 94 l30 0 m-6 -6 l6 6 l-6 6`} stroke={C.fern} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <T x={x + 15} y={84} size={9.5} color={C.fern} weight={600}>{label}</T>
    </g>
  );
  return (
    <Frame label="The course changed together live, saved with its history, shared with people and on a public page" h={190}>
      {box(16, "Editing", "together, live", C.gold)}
      {arrow(140, "Saved")}
      {box(176, "The course", "with its history", C.fern)}
      {arrow(300, "Share")}
      {box(336, "People", "view or edit", C.pond)}
      <rect x={470} y={52} width={76} height={84} rx={16} fill={C.panel} stroke={C.clay} />
      <T x={508} y={88} size={12} color={C.clay}>Public</T>
      <T x={508} y={106} size={10} color={C.soft} weight={500}>a link</T>
      <path d="M396 140 Q440 170 500 140" stroke={C.clay} strokeWidth={2} strokeDasharray="5 5" fill="none" />
      <T x={280} y={168} size={10} color={C.soft} weight={500}>Every save is in History: look, compare, restore</T>
    </Frame>
  );
}

/** A phone: the map, the panel as a sheet, the steps along the bottom. */
export function PhoneArt() {
  return (
    <Frame label="On a phone: the map on top, the panel as a sheet you pull up, the steps along the bottom" h={250}>
      <rect x={200} y={10} width={160} height={230} rx={26} fill="#0d120d" stroke={C.line} strokeWidth={2} />
      <rect x={210} y={22} width={140} height={206} rx={18} fill="#334a2a" />
      <rect x={216} y={28} width={128} height={20} rx={10} fill={C.panel} />
      <path d="M232 120 Q270 100 300 80 T330 60" stroke={C.fair} strokeWidth={9} fill="none" strokeLinecap="round" />
      <rect x={210} y={140} width={140} height={60} rx={14} fill={C.panel} />
      <rect x={266} y={146} width={28} height={4} rx={2} fill={C.soft} />
      {[0, 1, 2].map(i => <rect key={i} x={222} y={158 + i * 12} width={90 - i * 20} height={6} rx={3} fill={C.soft} opacity={0.7} />)}
      <rect x={210} y={204} width={140} height={24} rx={0} fill={C.panel} />
      {[0, 1, 2, 3].map(i => <circle key={i} cx={232 + i * 32} cy={216} r={5} fill={i === 1 ? C.fern : C.soft} />)}
      <T x={120} y={60} size={11} anchor="middle" color={C.text}>Pinch to zoom</T>
      <T x={120} y={78} size={11} anchor="middle" color={C.text}>Two fingers up: 3D</T>
      <T x={440} y={160} size={11} anchor="middle" color={C.text}>Drag the sheet</T>
      <T x={440} y={178} size={11} anchor="middle" color={C.soft} weight={500}>up for more</T>
      <T x={440} y={220} size={11} anchor="middle" color={C.text}>The four steps</T>
      <path d="M380 216 l-20 0" stroke={C.fern} strokeWidth={2} />
      <path d="M380 168 l-24 0" stroke={C.fern} strokeWidth={2} />
    </Frame>
  );
}

export const SECTION_ART: Partial<Record<string, () => JSX.Element>> = {
  start: StepsArt, design: HoleArt, view: FlyArt, map: MapStepArt, share: ShareArt, phone: PhoneArt
};
