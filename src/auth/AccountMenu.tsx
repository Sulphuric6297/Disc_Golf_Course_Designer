// The top bar's right side on a HyzerLab server (nothing in the browser-only demo): one chip for
// the open course (Live, Draft · changes, View only, Not saved) whose menu holds Publish, Discard,
// how you edit, review and history; then comments, share, notices and your account. The same
// choices for the phone's app menu.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { History, Inbox, LayoutGrid, LogOut, MessageCircle, Send, Share2, Trash2, UserRound, Users } from "lucide-react";
import { NoticeBell } from "./Notices";
import { useComments } from "./Comments";
import { SERVER, useAuth } from "./api";
import { discardDraft, draftChangeCount, draftChanges, inDraft, keepMine, reloadTheirs, saveNow, setLive, thumbnailNow, useServerCourse } from "./courses";
import { useCourse } from "../state/course";
import { useAllowed } from "./perms";

const signOut = async () => { await saveNow(); await useAuth.getState().signOut(); };
export const goHome = () => { useAuth.getState().showHome(true); void saveNow().then(thumbnailNow).then(() => useAuth.getState().bump()); };

/** A menu that closes on a click outside it or Esc. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  return { open, setOpen, ref };
}

const ROW = "w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 text-left disabled:opacity-40";
const Row = ({ icon, children, onClick, testid, danger }: { icon?: ReactNode; children: ReactNode; onClick: () => void; testid?: string; danger?: boolean }) => (
  <button className={`${ROW} ${danger ? "text-red-300" : ""}`} role="menuitem" onClick={onClick} data-testid={testid}>{icon}{children}</button>
);

/** The open course: how it's being changed, and what can be done about it. */
export function CourseChip() {
  const { status, role, conflict, preview, draft, approval, pending, id } = useServerCourse();
  const open = useAuth(s => s.open);
  useCourse(s => s.doc); // (what the draft changes, kept up to date)
  const m = useMenu();
  const [error, setError] = useState("");
  if (preview || !role) return null;
  if (role === "viewer") return <span className="px-2.5 py-1 rounded-full bg-sky-900/60 text-sky-200 text-[12px] font-semibold" data-testid="view-only">View only</span>;
  if (status === "conflict") {
    return (
      <div className="relative" ref={m.ref}>
        <button className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-200 text-[12px] font-semibold" onClick={() => m.setOpen(o => !o)} data-testid="save-conflict">Not saved</button>
        {m.open && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 z-50 text-sm" role="dialog" aria-label="Not saved">
            <p className="text-zinc-200 mb-2">{conflict}.</p>
            <div className="flex gap-2">
              <button className="flex-1 rounded-lg px-2 py-1.5 bg-orange-500 hover:bg-orange-400 text-white font-semibold" onClick={() => { m.setOpen(false); void reloadTheirs(); }}>Open theirs</button>
              <button className="flex-1 rounded-lg px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700" onClick={() => { m.setOpen(false); void keepMine(); }}>Save mine</button>
            </div>
          </div>
        )}
      </div>
    );
  }
  const drafting = inDraft();
  const n = drafting && draft ? draftChangeCount() : 0;
  const busy = status === "saving" || status === "unsaved";
  const sends = approval && role !== "owner";
  const choose = async (fn: () => Promise<void>) => {
    setError("");
    try { await fn(); m.setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  };
  const label = !drafting ? "Live" : n ? `Draft · ${n} change${n === 1 ? "" : "s"}` : "Draft";
  return (
    <div className="relative flex items-center gap-1.5" ref={m.ref}>
      {status === "error" && <span className="text-[12px] text-red-300">Can't save</span>}
      <button
        className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[12px] font-semibold border ${drafting ? "bg-orange-500/15 text-orange-200 border-orange-500/30" : "bg-emerald-500/10 text-emerald-200 border-emerald-500/25"}`}
        onClick={() => m.setOpen(o => !o)} aria-haspopup="menu" aria-expanded={m.open} data-testid="course-chip"
        title={drafting ? draftChanges() : "Changes go straight into the official layout"}>
        <span className={`w-1.5 h-1.5 rounded-full ${busy ? "bg-zinc-400 animate-pulse" : drafting ? "bg-orange-400" : "bg-emerald-400"}`} data-testid="save-status" data-state={busy ? "saving" : "saved"} />
        {label}
        {role === "owner" && pending > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-amber-500 text-zinc-950 text-[10px]" data-testid="review-count">{pending}</span>}
      </button>
      {drafting && n > 0 && (
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-semibold bg-orange-500 hover:bg-orange-400 text-white" onClick={() => open("publish")} data-testid="publish-button">
          <Send size={13} /> {sends ? "Send" : "Publish"}
        </button>
      )}
      {m.open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-50" role="menu" data-testid="course-menu">
          {drafting && (
            <>
              <div className="px-3 py-1.5 text-[12px] text-zinc-400">{draft ? draftChanges() : "No changes in your draft yet"}</div>
              {n > 0 && <Row icon={<Send size={15} />} onClick={() => { m.setOpen(false); open("publish"); }}>{sends ? "Send to the owner…" : "Publish…"}</Row>}
              {draft && <Row icon={<Trash2 size={15} />} danger testid="discard-draft" onClick={() => { if (confirm("Throw away your draft? The course stays as it is.")) void choose(discardDraft); }}>Discard draft</Row>}
              <div className="border-t border-zinc-800 my-1" />
            </>
          )}
          {role === "owner" && (
            <>
              <button className={`${ROW} ${!drafting ? "text-emerald-200" : ""}`} role="menuitemradio" aria-checked={!drafting} data-testid="mode-live"
                onClick={() => void choose(async () => {
                  if (draft && n > 0 && !confirm("Your draft has changes. Publish them first, or discard the draft. Discard it now?")) return;
                  if (draft) await discardDraft();
                  await setLive(true);
                })}>
                <span><span className="block">Publish as I go</span><span className="block text-[12px] text-zinc-500">Changes go straight into the official layout</span></span>
              </button>
              <button className={`${ROW} ${drafting ? "text-orange-200" : ""}`} role="menuitemradio" aria-checked={drafting} data-testid="mode-draft" onClick={() => void choose(() => setLive(false))}>
                <span><span className="block">Work in a draft</span><span className="block text-[12px] text-zinc-500">Publish when it's ready</span></span>
              </button>
              <div className="border-t border-zinc-800 my-1" />
              {pending > 0 && <Row icon={<Inbox size={15} />} testid="review-button" onClick={() => { m.setOpen(false); open("review"); }}>{pending} to review</Row>}
            </>
          )}
          {id && <Row icon={<History size={15} />} testid="history-button" onClick={() => { m.setOpen(false); open("history"); }}>History</Row>}
          {error && <p role="alert" className="px-3 py-1.5 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** The comments panel, with how many are open. */
function CommentsButton() {
  const { threads, panel } = useComments();
  const open = threads.filter(t => !t.resolvedAt).length;
  return (
    <button className={`relative p-2 rounded-lg hover:bg-zinc-800 ${panel ? "text-orange-300" : "text-zinc-400 hover:text-white"}`} aria-label={`Comments (${open})`} title="Comments" onClick={() => useComments.setState({ panel: !panel })} data-testid="comments-button">
      <MessageCircle size={18} />
      {open > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">{open}</span>}
    </button>
  );
}

/** `home`: on the course list (no open course's chip, comments or Share). */
export function AccountMenu({ home = false }: { home?: boolean }) {
  const user = useAuth(s => s.session?.user);
  const open = useAuth(s => s.open);
  const { role, preview, id: courseId } = useServerCourse();
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
      {course && role === "owner" && (
        <button className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" aria-label="Share" title="Share" onClick={() => open("share")} data-testid="share-button"><Share2 size={18} /></button>
      )}
      <NoticeBell />
      <div className="relative" ref={m.ref}>
        <button className="flex items-center gap-1.5 p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 text-sm" aria-label="Account" aria-haspopup="menu" aria-expanded={m.open} onClick={() => m.setOpen(o => !o)} data-testid="account-menu">
          <UserRound size={18} /><span className="hidden 2xl:inline max-w-[120px] truncate">{user.displayName}</span>
        </button>
        {m.open && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-50" role="menu">
            <div className="px-3 py-1.5 text-[12px] text-zinc-500 truncate">{user.displayName} · {user.username}</div>
            {!home && <Row icon={<LayoutGrid size={15} />} testid="courses-button" onClick={() => { m.setOpen(false); goHome(); }}>Courses</Row>}
            <Row icon={<UserRound size={15} />} onClick={() => { m.setOpen(false); open("account"); }}>Account</Row>
            {user.isAdmin && <Row icon={<Users size={15} />} onClick={() => { m.setOpen(false); open("people"); }}>People</Row>}
            <div className="border-t border-zinc-800 my-1" />
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
    ...(inDraft() && c.draft ? [{ label: c.approval && c.role !== "owner" ? "Send your changes" : "Publish your changes", icon: <Send size={19} />, run: () => open("publish") }] : []),
    ...(inDraft() && c.draft ? [{ label: "Discard draft", icon: <Trash2 size={19} />, run: () => { if (confirm("Throw away your draft?")) void discardDraft(); } }] : []),
    ...(c.role === "owner" && c.pending ? [{ label: `${c.pending} to review`, icon: <Inbox size={19} />, run: () => open("review") }] : []),
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
