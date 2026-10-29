// The top bar's right side on a HyzerLab server (nothing in the browser-only demo): one chip for
// the open course (Live, View only, Not saved) whose menu holds its history, with the others in it
// beside it; then comments, share, notices and your account. The same choices for the phone's app
// menu.
import { useEffect, useRef, useState } from "react";
import { HelpCircle, History, LayoutGrid, LogOut, MessageCircle, Share2, UserRound, Users } from "lucide-react";
import { FOCUS, MenuRow, POPOVER } from "../components/ui";
import { NoticeBell } from "./Notices";
import { useComments } from "./Comments";
import { SERVER, useAuth } from "./api";
import { keepMine, reloadTheirs, saveNow, thumbnailNow, useServerCourse } from "./courses";
import { useAllowed } from "./perms";
import { Faces } from "./Presence";

/** Up to two letters for the avatar. */
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

const signOut = async () => { await saveNow(); await useAuth.getState().signOut(); };
export const goHome = () => { useAuth.getState().showHome(true); void saveNow().then(thumbnailNow).then(() => useAuth.getState().bump()); };

/** A menu that closes on a click outside it or Esc. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    // (Esc closes just this, before the map hears it)
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  return { open, setOpen, ref };
}

const Row = MenuRow;
/** The icon buttons along the bar (comments, share, notices). */
const BAR = `relative p-2 rounded-lg text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.09] ${FOCUS}`;

/** The open course: how it's being changed, and what can be done about it. */
/** How the course is saved (live, or view only), with the others in it beside it. */
export function CourseChip() {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <Faces />
      <SaveChip />
    </div>
  );
}

function SaveChip() {
  const { status, role, conflict, preview, id } = useServerCourse();
  const open = useAuth(s => s.open);
  const m = useMenu();
  if (preview || !role) return null;
  if (role === "viewer") return <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-200 text-[12px] font-semibold" data-testid="view-only">View only</span>;
  if (status === "conflict") {
    return (
      <div className="relative" ref={m.ref}>
        <button className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-200 text-[12px] font-semibold" onClick={() => m.setOpen(o => !o)} data-testid="save-conflict">Not saved</button>
        {m.open && (
          <div className={`absolute right-0 top-full mt-1 w-64 ${POPOVER} p-3 z-50 text-sm`} role="dialog" aria-label="Not saved">
            <p className="text-zinc-200 mb-2">{conflict}.</p>
            <div className="flex gap-2">
              <button className="flex-1 rounded-lg px-2 py-1.5 bg-orange-500 hover:bg-orange-400 text-zinc-950 font-semibold" onClick={() => { m.setOpen(false); void reloadTheirs(); }}>Open theirs</button>
              <button className="flex-1 rounded-lg px-2 py-1.5 bg-white/[0.07] hover:bg-white/[0.13] text-zinc-100 border border-white/[0.12]" onClick={() => { m.setOpen(false); void keepMine(); }}>Save mine</button>
            </div>
          </div>
        )}
      </div>
    );
  }
  const busy = status === "saving" || status === "unsaved";
  return (
    <div className="relative flex items-center gap-1.5" ref={m.ref}>
      {status === "error" && <button className="text-[12px] text-red-300 hover:text-red-200 underline underline-offset-2" onClick={() => void saveNow()} title="The last changes aren't on the server yet" data-testid="save-retry">Not saved · try again</button>}
      <button
        className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[12px] font-semibold ${FOCUS} bg-emerald-500/10 text-emerald-200`}
        onClick={() => m.setOpen(o => !o)} aria-haspopup="menu" aria-expanded={m.open} data-testid="course-chip"
        title="Changes go straight into the course, live for everyone in it">
        <span className={`w-1.5 h-1.5 rounded-full ${busy ? "bg-zinc-400 animate-pulse" : "bg-emerald-400"}`} data-testid="save-status" data-state={busy ? "saving" : "saved"} />
        Live
      </button>
      {m.open && (
        <div className={`absolute right-0 top-full mt-1 w-72 ${POPOVER} py-1 z-50`} role="menu" data-testid="course-menu">
          <div className="px-3 py-1.5 text-[12px] text-zinc-400">Changes go straight into the course, live for everyone in it.</div>
          {id && <Row icon={<History size={15} />} testid="history-button" onClick={() => { m.setOpen(false); open("history"); }}>History</Row>}
        </div>
      )}
    </div>
  );
}

/** The comments panel, with how many threads are new for you (else how many are open, quietly). */
function CommentsButton() {
  const { threads, panel } = useComments();
  const open = threads.filter(t => !t.resolvedAt).length;
  const fresh = threads.filter(t => !t.resolvedAt && t.unread).length;
  return (
    <button className={`${BAR} ${panel ? "text-orange-300" : ""}`} aria-label={`Comments (${fresh ? `${fresh} new` : open})`} title="Comments (C to add one)" onClick={() => useComments.setState({ panel: !panel })} data-testid="comments-button">
      <MessageCircle size={18} />
      {fresh > 0
        ? <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center" data-testid="comments-new">{fresh}</span>
        : open > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-zinc-600 text-zinc-100 text-[10px] font-bold flex items-center justify-center">{open}</span>}
    </button>
  );
}

/** `home`: on the course list (no open course's chip, comments or Share). */
export function AccountMenu({ home = false, onHelp }: { home?: boolean; onHelp?: () => void }) {
  const user = useAuth(s => s.session?.user);
  const open = useAuth(s => s.open);
  const { preview, id: courseId } = useServerCourse();
  // (the course list covers the app: only its own menu then)
  const covered = useAuth(s => s.home) && !home;
  const m = useMenu();
  const mayComment = useAllowed("comments");
  if (!SERVER || !user || covered) return null;
  const course = !home && !preview && !!courseId;
  return (
    <>
      {!home && <CourseChip />}
      {course && mayComment && <CommentsButton />}
      {course && (
        <button className={BAR} aria-label="Share" title="Share" onClick={() => open("share")} data-testid="share-button"><Share2 size={18} /></button>
      )}
      <NoticeBell />
      <div className="relative" ref={m.ref}>
        <button className={`ml-1 w-8 h-8 rounded-full bg-white/[0.07] hover:bg-white/[0.13] text-zinc-100 text-[11px] font-bold flex items-center justify-center ${FOCUS} ${m.open ? "ring-2 ring-sky-400" : ""}`} aria-label="Account" title={user.displayName} aria-haspopup="menu" aria-expanded={m.open} onClick={() => m.setOpen(o => !o)} data-testid="account-menu">
          {initials(user.displayName)}
        </button>
        {m.open && (
          <div className={`absolute right-0 top-full mt-1 w-56 ${POPOVER} py-1 z-50`} role="menu">
            <div className="px-3 py-2"><div className="text-sm font-semibold text-zinc-100 truncate">{user.displayName}</div><div className="text-[12px] text-zinc-500 truncate">{user.username}</div></div>
            {!home && <Row icon={<LayoutGrid size={15} />} testid="courses-button" onClick={() => { m.setOpen(false); goHome(); }}>Courses</Row>}
            <Row icon={<UserRound size={15} />} onClick={() => { m.setOpen(false); open("account"); }}>Account</Row>
            {user.isAdmin && <Row icon={<Users size={15} />} onClick={() => { m.setOpen(false); open("people"); }}>People</Row>}
            {onHelp && <Row icon={<HelpCircle size={15} />} onClick={() => { m.setOpen(false); onHelp(); }}>Help guide</Row>}
            <div className="border-t border-white/[0.08] my-1" />
            <Row icon={<LogOut size={15} />} onClick={() => { m.setOpen(false); void signOut(); }}>Sign out</Row>
          </div>
        )}
      </div>
    </>
  );
}

/** The phone menu's rows for the account (none in the demo). */
export function accountActions() {
  const { session, open } = useAuth.getState();
  const user = session?.user;
  if (!SERVER || !user) return [];
  const c = useServerCourse.getState();
  const work = c.preview ? [] : [
    ...(c.id && (c.role === "owner" || c.role === "editor") ? [{ label: "History", icon: <History size={19} />, run: () => open("history") }] : [])
  ];
  return [
    ...(c.id && !c.preview ? [{ label: "Comments", icon: <MessageCircle size={19} />, run: () => useComments.setState({ panel: true }) }] : []),
    ...work,
    { label: "Courses", icon: <LayoutGrid size={19} />, run: goHome },
    { label: "Share", icon: <Share2 size={19} />, run: () => open("share") },
    { label: "Account", icon: <UserRound size={19} />, run: () => open("account") },
    ...(user.isAdmin ? [{ label: "People", icon: <Users size={19} />, run: () => open("people") }] : []),
    { label: "Sign out", icon: <LogOut size={19} />, run: () => void signOut() }
  ];
}
