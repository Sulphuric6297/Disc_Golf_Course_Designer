// A hole's elevation profile from tee to basket (heights stretched so small changes show).
import { profileAlong } from "../lib/terrainGrid";
import { fmtDist, toUnits } from "../lib/units";
import type { CourseDoc, P } from "../types";

export function ElevationProfile({ doc, line, height = 90 }: { doc: CourseDoc; line: P[]; height?: number }) {
  if (line.length < 2) return null;
  const prof = profileAlong(doc.terrainHeights, doc.gridSize, line, 80);
  const base = doc.site.baseElevationFt;
  const W = 300, H = height, pad = { l: 34, r: 8, t: 10, b: 18 };
  const hs = prof.map(p => p.h);
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const span = Math.max(10, hi - lo);
  const mid = (lo + hi) / 2;
  const y0 = mid - span * 0.6, y1 = mid + span * 0.6;
  const total = prof[prof.length - 1].d;
  const X = (d: number) => pad.l + (d / total) * (W - pad.l - pad.r);
  const Y = (h: number) => pad.t + (1 - (h - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const path = prof.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.h).toFixed(1)}`).join(" ");
  const fill = `${path} L${X(total)},${H - pad.b} L${X(0)},${H - pad.b} Z`;
  const u = doc.units;
  const lab = (h: number) => `${Math.round(toUnits(h + base, u))}`;
  const dh = prof[prof.length - 1].h - prof[0].h;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" data-testid="elevation-profile" role="img" aria-label={`Elevation profile: ${dh >= 0 ? "up" : "down"} ${Math.abs(Math.round(toUnits(dh, u)))} ${u}`}>
      <defs>
        <linearGradient id="prof-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#84cc16" stopOpacity="0.55" />
          <stop offset="1" stopColor="#365314" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map(k => {
        const h = y0 + (y1 - y0) * k;
        return (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(h)} y2={Y(h)} stroke="#3f3f46" strokeDasharray="2 3" />
            <text x={pad.l - 4} y={Y(h) + 3} fontSize="9" fill="#a1a1aa" textAnchor="end">{lab(h)}</text>
          </g>
        );
      })}
      <path d={fill} fill="url(#prof-fill)" />
      <path d={path} fill="none" stroke="#bef264" strokeWidth="2" />
      <circle cx={X(0)} cy={Y(prof[0].h)} r="4" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
      <circle cx={X(total)} cy={Y(prof[prof.length - 1].h)} r="4" fill="#f2c94c" stroke="#111" strokeWidth="1.5" />
      <text x={pad.l} y={H - 4} fontSize="9" fill="#a1a1aa">Tee</text>
      <text x={W - pad.r} y={H - 4} fontSize="9" fill="#a1a1aa" textAnchor="end">Basket · {fmtDist(total, u)}</text>
    </svg>
  );
}
