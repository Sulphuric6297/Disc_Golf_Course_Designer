// The first page after signing in: your courses and the ones shared with you, each with a small
// map of its holes, to open with one click; a new course; search. Beside them: what's waiting on
// you (drafts, changes to review), Getting started, the help topics that matter most, and a tip.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Eye, Lightbulb, ListChecks, Loader2, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { TOPICS } from "../lib/guide";
import { HelpGuide } from "../components/help/HelpGuide";
import { openGettingStarted, useStart } from "../components/GettingStarted";
import { useTouch } from "../components/useLayout";
import { fmtDist } from "../lib/units";
import { useCourse } from "../state/course";
import { useAuth } from "./api";
import { listServerCourses, newServerCourse, openServerCourse, removeServerCourse, useServerCourse, type ServerPlan } from "./courses";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./parts";
import { Woods } from "../components/Woods";
import { Loading } from "../components/ui";

/** The help topics most worth a look, in the order you'd need them. */
const LEARN = ["first-course", "find-site", "tees-pins", "ground", "tee-here", "map-style", "print"];

/** Tips, one at a time (a different one each visit). */
const TIPS = [
  "Press Ctrl+K and type what you're after, like \"tee sign\" or \"fairway width\". It finds any setting and takes you right to it.",
  "On a phone, hold your finger on open ground. You get a menu right there: a tee here, a pin here, bend the hole here, or measure from here.",
  "The Ground tool (G) paints the terrain. Raise a mound, flatten a tee pad, or smooth out a bumpy bit of survey data.",
  "Turn your location on and walk the course. Tee here and Basket here put them right where you're standing, which beats guessing from a photo.",
  "Pick a tree and pinch it with two fingers to make it bigger or smaller. Twist to turn tees and mandos the same way.",
  "One hole can have several tees for different skill levels. Several holes can also finish at the same basket. The hole's panel has a button for each.",
  "The painted map styles repaint as you change the course, so you can design straight on the printed map's look."
];

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
    return <div className="aspect-[4/3] bg-gradient-to-br from-emerald-950 to-zinc-900 flex items-center justify-center text-zinc-600 text-sm">{c.holes ? "" : "No holes yet"}</div>;
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const pad = Math.max(40, (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) * 0.08);
  let x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  // (the box as wide as the card: 16 by 10)
  if (w / h > 1.6) { const nh = w / 1.6; y0 -= (nh - h) / 2; h = nh; } else { const nw = h * 1.6; x0 -= (nw - w) / 2; w = nw; }
  const k = w / 320;
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} className="aspect-[4/3] w-full bg-gradient-to-br from-emerald-950 via-emerald-900/70 to-zinc-900" aria-hidden>
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
    <div className="aspect-[4/3] bg-white/[0.07] overflow-hidden">
      <img src={`./api/courses/${c.id}/thumbnail?v=${c.thumbAt}`} alt="" loading="lazy" className="w-full h-full object-cover" />
    </div>
  ) : <MiniMap c={c} />;

/** A course: its map, its name and numbers on a strip of glass over the map's foot (`big`: the
 * newest of the list, two columns wide). */
function Card({ c, onOpen, onRemove, big, opening }: { c: ServerPlan; onOpen: () => void; onRemove: () => void; big?: boolean; opening?: boolean }) {
  const r = ROLE[c.role];
  const s = c.summary;
  const facts = [`${c.holes} hole${c.holes === 1 ? "" : "s"}`, s.par ? `Par ${s.par}` : null, s.length && s.units ? fmtDist(s.length, s.units) : null].filter(Boolean).join(" · ");
  return (
    <li className={`group relative rounded-[22px] overflow-hidden ring-1 ring-white/10 hover:ring-white/25 shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition ${big ? "sm:col-span-2" : ""}`} data-testid="course-card">
      <button className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-[22px]" onClick={onOpen} aria-busy={opening || undefined}>
        <div className="transition-transform duration-500 group-hover:scale-[1.02]"><Picture c={c} /></div>
        {/* (opening: said on the card at once, while the course comes) */}
        {opening && (
          <div className="absolute inset-0 bg-black/40 flex items-start justify-center pt-[18%] animate-[dgfade_0.15s_ease_both]" data-testid="card-opening">
            <span className="glass rounded-full px-3.5 py-1.5 text-sm font-semibold text-zinc-50 inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin text-orange-300" /> Opening…</span>
          </div>
        )}
        <div className="glass absolute left-2.5 right-2.5 bottom-2.5 rounded-[16px] px-3.5 py-2.5">
          <div className="flex items-start gap-2">
            <h3 className={`flex-1 min-w-0 font-semibold text-zinc-50 truncate ${big ? "text-lg" : ""}`}>{c.name || "Untitled course"}</h3>
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.cls}`}><r.icon size={11} />{r.label}</span>
          </div>
          <p className="text-[13px] text-zinc-300 mt-0.5">{facts}{c.park ? <span className="text-zinc-500"> · {c.park}</span> : null}</p>
          {(c.hasDraft || c.toReview > 0) && (
            <div className="flex gap-1.5 mt-2">
              {c.hasDraft && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-200" data-testid="has-draft">Your draft</span>}
              {c.toReview > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-200" data-testid="to-review">{c.toReview} to review</span>}
            </div>
          )}
          <p className="text-[11.5px] text-zinc-400 mt-1 flex flex-wrap items-center gap-x-1.5">
            {c.role !== "owner" && c.owner && <span>{c.owner}'s ·</span>}
            {c.members > 1 && <span className="inline-flex items-center gap-0.5" title={`${c.members} people have it`}><Users size={11} />{c.members} ·</span>}
            <span>updated {ago(c.updatedAt)}{c.updatedBy ? ` by ${c.updatedBy}` : ""}</span>
          </p>
        </div>
      </button>
      <button className="glass absolute top-2.5 right-2.5 p-1.5 rounded-full text-zinc-200 hover:text-red-300 opacity-0 group-hover:opacity-100 focus:opacity-100 touch:opacity-100 transition-opacity"
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
  // (the list couldn't be had: said so, not shown as no courses)
  const [failed, setFailed] = useState(false);
  // (a removal that didn't go through: the editor's notices are behind this page)
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const openId = useServerCourse(s => s.id);
  const openName = useCourse(s => s.doc.name);

  const listVersion = useAuth(s => s.listVersion);
  const refresh = () => listServerCourses().then(l => { setFailed(false); setList(l); }, () => { setFailed(true); setList(o => o ?? []); });
  useEffect(() => { void refresh(); }, [listVersion]);
  // (drawn: the editor may load behind the list now; a frame later, so the cards paint first)
  useEffect(() => { if (list) requestAnimationFrame(() => setTimeout(() => useAuth.setState({ listShown: true }), 0)); }, [list]);

  const [park, setPark] = useState("");
  const parks = useMemo(() => [...new Set((list ?? []).map(c => c.park).filter(Boolean))].sort(), [list]);
  const shown = useMemo(() => (list ?? []).filter(c => (!park || c.park === park) && (!q.trim() || `${c.name} ${c.owner ?? ""} ${c.park}`.toLowerCase().includes(q.trim().toLowerCase()))), [list, q, park]);
  const mine = shown.filter(c => c.role === "owner");
  const shared = shown.filter(c => c.role !== "owner");
  // (the course being opened, or a new one being made: one at a time, shown while it comes)
  const [opening, setOpening] = useState<string | null>(null);
  const open = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try { if (await openServerCourse(id)) showHome(false); } finally { setOpening(null); }
  };
  const fresh = async () => {
    if (opening) return;
    setOpening("new");
    try { await newServerCourse(); showHome(false); } finally { setOpening(null); }
  };

  // What's waiting on you: changes sent for your OK, and drafts of your own not published yet
  const waiting = (list ?? []).filter(c => c.toReview > 0 || c.hasDraft);
  const [help, setHelp] = useState<false | { topic?: string }>(false);
  const touch = useTouch();
  const start = useStart();
  const startDone = [start.seen3d, start.checks, start.map, start.export].filter(Boolean).length + ((list ?? []).some(c => c.role === "owner") ? 1 : 0);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const learn = LEARN.map(id => TOPICS.find(t => t.id === id)).filter(Boolean) as typeof TOPICS;
  /** Getting started: in the newest course (or a new one), its list open. */
  const startTour = () => { openGettingStarted(); const c = mine[0] ?? shown[0]; void (c ? open(c.id) : fresh()); };
  const side = (
    <aside className="flex flex-col gap-4" data-testid="home-side">
      {start.onHome && <div className="glass rounded-[22px] p-4" data-testid="home-start">
        <div className="flex items-center gap-2 text-[14px] font-bold text-zinc-50"><ListChecks size={17} className="text-orange-300" /><span className="flex-1">Getting started</span>
          <button className="w-7 h-7 -m-1 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.08]" aria-label="Take Getting started off the dashboard" title="Take it off (Show Getting started under Learn the app brings it back)" onClick={() => start.set({ onHome: false })} data-testid="home-start-hide"><X size={15} /></button></div>
        <p className="text-[13px] text-zinc-400 mt-1.5 leading-snug">A short list of the main things to do, from finding your park to printing tee signs. It ticks itself off as you go, and Show me points at each one.</p>
        <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-orange-300" style={{ width: `${(startDone / 7) * 100}%` }} /></div>
        <button className="mt-3 w-full rounded-full px-3 py-2 text-[13px] font-semibold bg-white/[0.1] hover:bg-white/[0.16] text-zinc-50" onClick={startTour} disabled={!!opening} data-testid="home-start-open">{startDone ? "Pick up where you left off" : "Show me around"}</button>
      </div>}
      <div className="glass rounded-[22px] p-4" data-testid="home-learn">
        <div className="flex items-center gap-2 text-[14px] font-bold text-zinc-50"><BookOpen size={16} className="text-orange-300" />Learn the app</div>
        <ul className="mt-2 -mx-1.5">
          {learn.map(t => (
            <li key={t.id}><button className="w-full text-left rounded-[12px] px-1.5 py-1.5 hover:bg-white/[0.07] text-[13px] text-zinc-200" onClick={() => setHelp({ topic: t.id })} data-testid={`home-learn-${t.id}`}>{t.title}</button></li>
          ))}
        </ul>
        <button className="mt-1 text-[12.5px] font-semibold text-orange-300 hover:text-orange-200" onClick={() => setHelp({})} data-testid="home-help">The whole help guide ›</button>
        {!start.onHome && <button className="block mt-1.5 text-[12.5px] font-semibold text-zinc-400 hover:text-zinc-200" onClick={() => start.set({ onHome: true })} data-testid="home-start-show">Show Getting started</button>}
      </div>
      <div className="glass rounded-[22px] p-4" data-testid="home-tip">
        <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-50"><Lightbulb size={15} className="text-amber-300" />Tip</div>
        <p className="text-[13px] text-zinc-300 mt-1.5 leading-snug">{tip}</p>
      </div>
    </aside>
  );

  const grid = (cs: ServerPlan[]) => (
    <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {cs.map((c, i) => <Card key={c.id} c={c} big={i === 0 && cs.length > 2} opening={opening === c.id} onOpen={() => void open(c.id)} onRemove={() => { setNotice(""); void removeServerCourse(c.id, c).then(refresh, e => setNotice(`Couldn't remove "${c.name}": ${e instanceof Error ? e.message : "try again"}.`)); }} />)}
    </ul>
  );

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950 overflow-y-auto isolate" data-testid="home">
      {/* (the woods behind: the newest course's own map, blurred, or a painted one) */}
      <Woods />
      <header className="glass sticky top-2.5 z-10 mx-2.5 rounded-[22px]">
        <div className="max-w-6xl mx-auto h-[52px] px-3 flex items-center gap-3">
          <Logo size={30} />
          <span className="font-bold text-zinc-50 text-[17px] hidden sm:inline">HyzerLab</span>
          <div className="flex-1" />
          {openId && (
            <button className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-zinc-200 hover:bg-white/[0.08] max-w-[260px]" onClick={() => showHome(false)} data-testid="back-to-course">
              <ArrowLeft size={15} /><span className="truncate">{openName}</span>
            </button>
          )}
          <AccountMenu home />
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6 lg:pr-[324px]">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-[34px] font-bold tracking-[-0.025em] text-zinc-50">Courses</h1>
            <p className="text-zinc-400 text-sm mt-1">Hi {user.displayName.split(" ")[0]}.</p>
          </div>
          <label className="relative sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input className="glass w-full rounded-full pl-9 pr-3 py-2 text-sm touch:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-400/80" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search courses" />
          </label>
          <button className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 touch:py-3 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow" onClick={() => void fresh()} disabled={!!opening} aria-busy={opening === "new" || undefined} data-testid="new-course">
            {opening === "new" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} New course
          </button>
        </div>

        {parks.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="Parks" data-testid="park-chips">
            {["", ...parks].map(p => (
              <button key={p || "all"} className={`px-3 py-1 rounded-full text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${park === p ? "bg-white/[0.2] text-zinc-50 font-semibold" : "glass text-zinc-300 hover:text-zinc-50"}`} onClick={() => setPark(p)}>{p || "All parks"}</button>
            ))}
          </div>
        )}
        {notice && <p className="glass rounded-[18px] px-4 py-3 mb-4 text-sm text-red-200" role="alert">{notice}</p>}
        {failed && (
          <div className="glass rounded-[18px] px-4 py-3 mb-4 flex items-center gap-3 text-sm text-zinc-200" role="alert" data-testid="list-failed">
            <span className="flex-1">Couldn't load your courses. Check the connection.</span>
            <button className="px-3 py-1.5 rounded-full bg-white/[0.1] hover:bg-white/[0.16] font-semibold" onClick={() => void refresh()}>Try again</button>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="min-w-0">
        {waiting.length > 0 && (
          <section className="mb-6" data-testid="home-waiting">
            <h2 className="text-[15px] font-semibold text-zinc-200 mb-2.5">Needs you</h2>
            <ul className="flex flex-col gap-2">
              {waiting.slice(0, 4).map(c => (
                <li key={c.id}>
                  <button className="glass w-full rounded-[16px] px-4 py-2.5 flex items-center gap-3 text-left hover:ring-1 hover:ring-white/20" onClick={() => void open(c.id)} disabled={!!opening}>
                    <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold text-zinc-50 truncate">{c.name}</span>
                      <span className="block text-[12.5px] text-zinc-400">{c.toReview > 0 ? `${c.toReview} change${c.toReview === 1 ? "" : "s"} sent for your OK` : "Your draft isn't published yet"}</span></span>
                    {opening === c.id ? <Loader2 size={16} className="animate-spin text-zinc-400" /> : <span className="text-[13px] font-semibold text-orange-300">Open</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {list === null ? <Loading label="Loading your courses…" className="h-40" /> : list.length === 0 && failed ? null : list.length === 0 ? (
          <div className="glass text-center py-20 rounded-[24px]">
            <Logo size={48} />
            <h2 className="text-lg font-semibold text-zinc-100 mt-4">No courses yet</h2>
            <p className="text-sm text-zinc-400 mt-1">Start one, or ask someone to share theirs.</p>
            <button className="mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950" onClick={() => void fresh()}><Plus size={16} /> New course</button>
          </div>
        ) : (
          <>
            <section className="mb-10" data-testid="my-courses">
              <h2 className="text-[15px] font-semibold text-zinc-200 mb-3">Your courses <span className="text-zinc-500 font-normal">{mine.length}</span></h2>
              {mine.length ? grid(mine) : <p className="text-sm text-zinc-500">None{q ? " match" : " yet"}.</p>}
            </section>
            <section data-testid="shared-courses">
              <h2 className="text-[15px] font-semibold text-zinc-200 mb-3">Shared with you <span className="text-zinc-500 font-normal">{shared.length}</span></h2>
              {shared.length ? grid(shared) : <p className="text-sm text-zinc-500">{q ? "None match." : "Courses others share with you show up here."}</p>}
            </section>
          </>
        )}
        </div>
        {side}
        </div>
      </main>
      {help && <HelpGuide onClose={() => setHelp(false)} topic={help.topic} touch={touch} />}
    </div>
  );
}
