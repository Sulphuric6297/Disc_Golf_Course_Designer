// The public demo (the browser-only build, on GitHub Pages): the app as it really is, with the
// parts that need a server (accounts, sharing, comments, history, public course pages, courses
// sharing a park) shown where they'd be but locked. Each one, picked, says what it does and that
// hosting HyzerLab yourself turns it on. (The one explainer in the app, at the owner's request.)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bell, ExternalLink, History, Lock, MessageCircle, Share2, UserRound, X } from "lucide-react";
import { create } from "zustand";

export const REPO = "https://github.com/Sulphuric6297/Disc_Golf_Course_Designer#your-own-server-hyzerlab";

/** What hosting it yourself adds, in the demo's note. */
export const DEMO_ADDS = [
  "Accounts for the people you invite, with two-factor sign-in if you want it",
  "Courses kept on your server, shared with editors and viewers",
  "Editing together, live, and a history you can go back to",
  "Comments pinned right on the map",
  "A public page for each course, showing what you pick",
  "Several courses on one park's map, warning you when holes get too close"
];

/** The parts the demo locks, and what each one does. */
export const LOCKED = {
  comments: { title: "Comments", icon: MessageCircle, what: "Comments let everyone working on the course pin a note right on the map, reply to it, and mark it done once it's sorted." },
  share: { title: "Sharing", icon: Share2, what: "Sharing lets you invite people as editors or viewers, or make a link anyone can open, and pick exactly what each of them gets to see." },
  notices: { title: "Notifications", icon: Bell, what: "The bell lets you know when someone comments, mentions you, or sends you changes to look over." },
  account: { title: "Accounts", icon: UserRound, what: "Accounts are invite-only. You add the people, they sign in (with two-factor if you want it), and your courses live on your server instead of in one browser." },
  courses: { title: "Courses", icon: UserRound, what: "Courses is the page with everything you've made and everything shared with you, each with a small map of its holes." },
  history: { title: "History", icon: History, what: "Everyone you make an editor changes the course with you, live. Its versions are kept as it changes, so you can go back to an older one." },
  site: { title: "Public course page", icon: Share2, what: "A public page for the course: the map, every hole, the flyovers and the files to download. You pick what it shows." },
  park: { title: "Other courses in the park", icon: Share2, what: "When a few courses share the same ground, each one shows up on the others' maps, and HyzerLab tells you when one of your holes crosses or crowds one of theirs." },
  demo: { title: "The public demo", icon: Lock, what: "You can design a full course here: bring in a park, lay out the holes, and make the maps and tee signs. It all saves in this browser. The parts that need other people have a lock on them." }
} as const;
export type LockedId = keyof typeof LOCKED;

const useLocked = create<{ open: LockedId | null }>(() => ({ open: null }));
/** The note for a locked part, over everything. */
export const showLocked = (id: LockedId) => useLocked.setState({ open: id });

/** The note a locked part opens: what it does, why the demo can't, and how to get it. */
export function LockedNote() {
  const open = useLocked(s => s.open);
  const close = () => useLocked.setState({ open: null });
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open]);
  if (!open) return null;
  const f = LOCKED[open];
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/45 p-3" onPointerDown={e => { if (e.target === e.currentTarget) close(); }} data-testid="locked-note">
      <div className="glass-solid w-full max-w-[420px] rounded-[22px] ring-1 ring-white/10 shadow-2xl p-5" role="dialog" aria-label={f.title}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 w-9 h-9 shrink-0 rounded-full bg-sky-500/15 text-sky-200 flex items-center justify-center"><Lock size={17} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold text-zinc-50">{f.title}</div>
            <p className="mt-1.5 text-[14px] leading-snug text-zinc-200">{f.what}</p>
          </div>
          <button className="p-1.5 -mr-1.5 -mt-1 touch:w-11 touch:h-11 touch:-mr-3 touch:-mt-2.5 touch:flex touch:items-center touch:justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]" aria-label="Close" onClick={close}><X size={18} /></button>
        </div>
        {open === "demo" ? (
          // (the demo itself: what hosting it adds, as the top bar's Demo note says)
          <>
            <p className="mt-3 text-[13.5px] leading-snug text-zinc-300">There's no server behind the demo to keep accounts or share anything. Host HyzerLab yourself and you also get:</p>
            <ul className="mt-1.5 space-y-1 text-[13.5px] leading-snug text-zinc-300 list-disc pl-5">{DEMO_ADDS.map(a => <li key={a}>{a}</li>)}</ul>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13.5px] leading-snug text-zinc-300">This is the public demo. It all runs in your browser, which is fine for trying it out, but there's no server behind it to hold accounts or share anything with anyone.</p>
            <p className="mt-2 text-[13.5px] leading-snug text-zinc-300">Run HyzerLab on your own server and this works. It's free and open source, and the README walks you through the setup.</p>
          </>
        )}
        <div className="mt-4 flex gap-2 justify-end">
          <button className="rounded-full px-4 py-2 touch:py-3 text-[13.5px] font-semibold text-zinc-200 hover:bg-white/[0.08]" onClick={close}>Close</button>
          <a className="rounded-full px-4 py-2 touch:py-3 text-[13.5px] font-semibold bg-orange-400 text-zinc-950 hover:bg-orange-300 inline-flex items-center gap-1.5" href={REPO} target="_blank" rel="noreferrer" data-testid="locked-host">How to host it <ExternalLink size={14} /></a>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A lock on a button's corner: it's there, it just needs a server. */
export const LockBadge = () => <span className="absolute -right-0.5 -bottom-0.5 w-[15px] h-[15px] rounded-full bg-zinc-900 ring-1 ring-white/20 flex items-center justify-center text-zinc-300"><Lock size={9} /></span>;

/** A row for a locked part (in a list of options): looks like the real one, with a lock. */
export function LockedRow({ id, icon, label, sub }: { id: LockedId; icon: ReactNode; label: string; sub?: string }) {
  return (
    <button className="w-full flex items-center gap-3 px-3 py-2.5 touch:py-3.5 text-left hover:bg-white/[0.05]" onClick={() => showLocked(id)} data-testid={`locked-${id}`}>
      <span className="relative w-7 h-7 rounded-[8px] bg-white/[0.1] flex items-center justify-center text-zinc-300">{icon}<LockBadge /></span>
      <span className="flex-1 min-w-0"><span className="block text-[13.5px] text-zinc-200">{label}</span>{sub && <span className="block text-[11.5px] text-zinc-400">{sub}</span>}</span>
      <Lock size={14} className="text-zinc-500" />
    </button>
  );
}

const BAR = "relative p-2 touch:p-3 rounded-lg text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.09]";

/** The top bar's right side in the demo: comments, Share, the bell and the account, as on a
 * server but locked, then the Demo chip. */
export function DemoBar() {
  return (
    <>
      <button className={BAR} aria-label="Comments (locked in the demo)" title="Comments" onClick={() => showLocked("comments")} data-testid="locked-bar-comments"><MessageCircle size={18} /><LockBadge /></button>
      <button className={BAR} aria-label="Share (locked in the demo)" title="Share" onClick={() => showLocked("share")} data-testid="locked-bar-share"><Share2 size={18} /><LockBadge /></button>
      <button className={BAR} aria-label="Notifications (locked in the demo)" title="Notifications" onClick={() => showLocked("notices")} data-testid="locked-bar-notices"><Bell size={18} /><LockBadge /></button>
      <button className="relative ml-1 w-8 h-8 touch:w-11 touch:h-11 rounded-full bg-white/[0.07] hover:bg-white/[0.13] text-zinc-300 flex items-center justify-center" aria-label="Account (locked in the demo)" title="Account" onClick={() => showLocked("account")} data-testid="locked-bar-account"><UserRound size={16} /><LockBadge /></button>
      <DemoNote />
    </>
  );
}

export function DemoNote() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="px-2.5 py-1 touch:py-2.5 touch:px-3.5 rounded-full text-[12px] font-semibold bg-sky-500/15 text-sky-200 border border-sky-500/30 hover:bg-sky-500/25" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="demo-note">Demo</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[340px] glass-solid rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 p-4 z-50 text-sm" role="dialog" aria-label="The demo">
          <p className="text-zinc-100 font-semibold">This is the public demo</p>
          <p className="text-zinc-300 mt-1">You can design a full course here: bring in a park, lay out the holes, and make the maps and tee signs. It all saves in this browser.</p>
          <p className="text-zinc-300 mt-2">The parts that need other people have a lock on them. There's no server behind the demo to keep accounts or share anything. Host HyzerLab yourself and you also get:</p>
          <ul className="mt-1.5 space-y-1 text-zinc-300 list-disc pl-5">{DEMO_ADDS.map(a => <li key={a}>{a}</li>)}</ul>
          <a className="mt-3 inline-flex items-center gap-1.5 text-orange-300 hover:text-orange-200" href={REPO} target="_blank" rel="noreferrer">How to host it <ExternalLink size={13} /></a>
        </div>
      )}
    </div>
  );
}
