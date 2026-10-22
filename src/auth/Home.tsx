// The first page after signing in: your courses and the ones shared with you, each with a small
// map of its holes, to open with one click; a new course; search.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { fmtDist } from "../lib/units";
import { useCourse } from "../state/course";
import { useAuth } from "./api";
import { listServerCourses, newServerCourse, openServerCourse, removeServerCourse, useServerCourse, type ServerPlan } from "./courses";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./parts";

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = s / 60, h = m / 60, d = h / 24;
  if (m < 60) return `${Math.round(m)} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  if (d < 30) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString();
};

/** The holes' throw lines, fitted into the card. */
function MiniMap({ c }: { c: ServerPlan }) {
  const s = c.summary;
  const lines = s.lines ?? [];
  const pts = lines.flat();
  if (!pts.length) {
    return <div className="aspect-[16/10] bg-gradient-to-br from-emerald-950 to-zinc-900 flex items-center justify-center text-zinc-600 text-sm">{c.holes ? "" : "No holes yet"}</div>;
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const pad = Math.max(40, (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) * 0.08);
  let x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  // (the box as wide as the card: 16 by 10)
  if (w / h > 1.6) { const nh = w / 1.6; y0 -= (nh - h) / 2; h = nh; } else { const nw = h * 1.6; x0 -= (nw - w) / 2; w = nw; }
  const k = w / 320;
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} className="aspect-[16/10] w-full bg-gradient-to-br from-emerald-950 via-emerald-900/70 to-zinc-900" aria-hidden>
      {lines.map((l, i) => (
        <g key={i}>
          <polyline points={l.map(p => p.join(",")).join(" ")} fill="none" stroke="#fde68a" strokeOpacity={0.85} strokeWidth={2.2 * k} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={l[0][0]} cy={l[0][1]} r={3.6 * k} fill="#38bdf8" />
          <circle cx={l[l.length - 1][0]} cy={l[l.length - 1][1]} r={4 * k} fill="#f97316" stroke="#111" strokeWidth={1 * k} />
        </g>
      ))}
    </svg>
  );
}

const ROLE = {
  owner: { label: "Owner", cls: "bg-orange-500/15 text-orange-200", icon: Pencil },
  editor: { label: "Editor", cls: "bg-emerald-500/15 text-emerald-200", icon: Pencil },
  viewer: { label: "View only", cls: "bg-sky-500/15 text-sky-200", icon: Eye }
};

/** The course's printed map, or its holes' lines until it has one. */
const Picture = ({ c }: { c: ServerPlan }) =>
  c.thumbAt ? (
    <div className="aspect-[16/10] bg-zinc-800 overflow-hidden">
      <img src={`./api/courses/${c.id}/thumbnail?v=${c.thumbAt}`} alt="" loading="lazy" className="w-full h-full object-cover" />
    </div>
  ) : <MiniMap c={c} />;

function Card({ c, onOpen, onRemove }: { c: ServerPlan; onOpen: () => void; onRemove: () => void }) {
  const r = ROLE[c.role];
  const s = c.summary;
  const facts = [`${c.holes} hole${c.holes === 1 ? "" : "s"}`, s.par ? `Par ${s.par}` : null, s.length && s.units ? fmtDist(s.length, s.units) : null].filter(Boolean).join(" · ");
  return (
    <li className="group relative bg-zinc-900 hover:bg-zinc-800/80 rounded-2xl overflow-hidden transition-colors ring-1 ring-white/5 hover:ring-white/10" data-testid="course-card">
      <button className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-2xl" onClick={onOpen}>
        <Picture c={c} />
        <div className="p-3.5">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 min-w-0 font-semibold text-zinc-50 truncate">{c.name || "Untitled course"}</h3>
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.cls}`}><r.icon size={11} />{r.label}</span>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">{facts}{c.park ? <span className="text-zinc-500"> · {c.park}</span> : null}</p>
          {(c.hasDraft || c.toReview > 0) && (
            <div className="flex gap-1.5 mt-2">
              {c.hasDraft && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-200" data-testid="has-draft">Your draft</span>}
              {c.toReview > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-200" data-testid="to-review">{c.toReview} to review</span>}
            </div>
          )}
          <p className="text-[12px] text-zinc-500 mt-2 flex flex-wrap items-center gap-x-1.5">
            {c.role !== "owner" && c.owner && <span>{c.owner}'s ·</span>}
            {c.members > 1 && <span className="inline-flex items-center gap-0.5" title={`${c.members} people have it`}><Users size={11} />{c.members} ·</span>}
            <span>updated {ago(c.updatedAt)}{c.updatedBy ? ` by ${c.updatedBy}` : ""}</span>
          </p>
        </div>
      </button>
      <button className="absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-950/70 text-zinc-300 hover:text-red-300 opacity-0 group-hover:opacity-100 focus:opacity-100 touch:opacity-100 transition-opacity"
        aria-label={c.role === "owner" ? `Delete ${c.name}` : `Take ${c.name} off your list`} onClick={onRemove}>
        <Trash2 size={15} />
      </button>
    </li>
  );
}

export function Home() {
  const user = useAuth(s => s.session!.user!);
  const showHome = useAuth(s => s.showHome);
  const [list, setList] = useState<ServerPlan[] | null>(null);
  const [q, setQ] = useState("");
  const openId = useServerCourse(s => s.id);
  const openName = useCourse(s => s.doc.name);

  const listVersion = useAuth(s => s.listVersion);
  const refresh = () => listServerCourses().then(setList, () => setList([]));
  useEffect(() => { void refresh(); }, [listVersion]);

  const [park, setPark] = useState("");
  const parks = useMemo(() => [...new Set((list ?? []).map(c => c.park).filter(Boolean))].sort(), [list]);
  const shown = useMemo(() => (list ?? []).filter(c => (!park || c.park === park) && (!q.trim() || `${c.name} ${c.owner ?? ""} ${c.park}`.toLowerCase().includes(q.trim().toLowerCase()))), [list, q, park]);
  const mine = shown.filter(c => c.role === "owner");
  const shared = shown.filter(c => c.role !== "owner");
  const open = async (id: string) => { if (await openServerCourse(id)) showHome(false); };
  const fresh = async () => { await newServerCourse(); showHome(false); };

  const grid = (cs: ServerPlan[]) => (
    <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cs.map(c => <Card key={c.id} c={c} onOpen={() => void open(c.id)} onRemove={() => void removeServerCourse(c.id).then(refresh)} />)}
    </ul>
  );

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950 overflow-y-auto" data-testid="home">
      <header className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="max-w-6xl mx-auto h-14 px-4 flex items-center gap-3">
          <Logo size={30} />
          <span className="font-bold text-zinc-50 text-[17px] hidden sm:inline">HyzerLab</span>
          <div className="flex-1" />
          {openId && (
            <button className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 max-w-[260px]" onClick={() => showHome(false)} data-testid="back-to-course">
              <ArrowLeft size={15} /><span className="truncate">{openName}</span>
            </button>
          )}
          <AccountMenu home />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50">Courses</h1>
            <p className="text-zinc-400 text-sm mt-1">Hi {user.displayName.split(" ")[0]}.</p>
          </div>
          <label className="relative sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input className="w-full bg-zinc-900 rounded-lg pl-9 pr-3 py-2 text-sm touch:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-400/80" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search courses" />
          </label>
          <button className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 touch:py-3 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow" onClick={() => void fresh()} data-testid="new-course">
            <Plus size={16} /> New course
          </button>
        </div>

        {parks.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="Parks" data-testid="park-chips">
            {["", ...parks].map(p => (
              <button key={p || "all"} className={`px-3 py-1 rounded-full text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${park === p ? "bg-zinc-100 text-zinc-900 font-semibold" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`} onClick={() => setPark(p)}>{p || "All parks"}</button>
            ))}
          </div>
        )}
        {list === null ? <div className="h-40" aria-busy="true" /> : list.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/60 rounded-2xl">
            <Logo size={48} />
            <h2 className="text-lg font-semibold text-zinc-100 mt-4">No courses yet</h2>
            <p className="text-sm text-zinc-400 mt-1">Start one, or ask someone to share theirs.</p>
            <button className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950" onClick={() => void fresh()}><Plus size={16} /> New course</button>
          </div>
        ) : (
          <>
            <section className="mb-10" data-testid="my-courses">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Your courses <span className="text-zinc-500 font-normal">{mine.length}</span></h2>
              {mine.length ? grid(mine) : <p className="text-sm text-zinc-500">None{q ? " match" : " yet"}.</p>}
            </section>
            <section data-testid="shared-courses">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Shared with you <span className="text-zinc-500 font-normal">{shared.length}</span></h2>
              {shared.length ? grid(shared) : <p className="text-sm text-zinc-500">{q ? "None match." : "Courses others share with you show up here."}</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
