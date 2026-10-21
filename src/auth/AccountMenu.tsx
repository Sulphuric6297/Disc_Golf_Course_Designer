// The account button in the top bar, with the open course's saving and Share (nothing in the
// browser-only demo), and the same choices for the phone's app menu.
import { useEffect, useRef, useState } from "react";
import { History, Inbox, LayoutGrid, LogOut, Send, Share2, UserRound, Users } from "lucide-react";
import { SERVER, useAuth } from "./api";
import { keepMine, reloadTheirs, saveNow, thumbnailNow, useServerCourse } from "./courses";

const signOut = async () => { await saveNow(); await useAuth.getState().signOut(); };

/** Saving, view only, or someone else saved meanwhile. */
function CourseStatus() {
  const { status, role, conflict, preview } = useServerCourse();
  const [ask, setAsk] = useState(false);
  if (preview) return null;
  if (role === "viewer") return <span className="px-2 py-0.5 rounded-full bg-sky-900/60 text-sky-200 text-[12px] font-semibold" data-testid="view-only">View only</span>;
  if (status === "conflict") {
    return (
      <div className="relative">
        <button className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-[12px] font-semibold" onClick={() => setAsk(a => !a)} data-testid="save-conflict">Not saved</button>
        {ask && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 z-50 text-sm" role="dialog" aria-label="Not saved">
            <p className="text-zinc-200 mb-2">{conflict}.</p>
            <div className="flex gap-2">
              <button className="flex-1 rounded-lg px-2 py-1.5 bg-orange-500 hover:bg-orange-400 text-white font-semibold" onClick={() => { setAsk(false); void reloadTheirs(); }}>Open theirs</button>
              <button className="flex-1 rounded-lg px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700" onClick={() => { setAsk(false); void keepMine(); }}>Save mine</button>
            </div>
          </div>
        )}
      </div>
    );
  }
  const text = role === "editor"
    ? { saved: "Draft saved", saving: "Saving draft…", unsaved: "Saving draft…", error: "Can't save", conflict: "" }[status]
    : { saved: "Saved", saving: "Saving…", unsaved: "Saving…", error: "Can't save", conflict: "" }[status];
  return <span className={`text-[12px] ${status === "error" ? "text-red-300" : "text-zinc-500"}`} data-testid="save-status">{text}</span>;
}

/** `home`: on the course list (no open course's saving or Share; no Courses button). */
export function AccountMenu({ home = false }: { home?: boolean }) {
  const user = useAuth(s => s.session?.user);
  const open = useAuth(s => s.open);
  const { role, draft, approval, pending, preview, id: courseId } = useServerCourse();
  // (the course list covers the app: only its own menu then)
  const covered = useAuth(s => s.home) && !home;
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [menu]);
  if (!SERVER || !user || covered) return null;
  const item = "w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 text-left";
  return (
    <>
    {!home && <CourseStatus />}
    {!home && (
      <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-zinc-200 hover:bg-zinc-800" onClick={() => { useAuth.getState().showHome(true); void saveNow().then(thumbnailNow).then(() => useAuth.getState().bump()); }} data-testid="courses-button">
        <LayoutGrid size={15} /> Courses
      </button>
    )}
    {!home && !preview && role === "editor" && draft && (
      <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-white" onClick={() => open("publish")} data-testid="publish-button">
        <Send size={14} /> {approval ? "Send" : "Publish"}
      </button>
    )}
    {!home && !preview && role === "owner" && pending > 0 && (
      <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold bg-amber-500/20 text-amber-200 hover:bg-amber-500/30" onClick={() => open("review")} data-testid="review-button">
        <Inbox size={14} /> {pending} to review
      </button>
    )}
    {!home && !preview && courseId && (role === "owner" || role === "editor") && (
      <button className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" aria-label="History" title="History" onClick={() => open("history")} data-testid="history-button">
        <History size={18} />
      </button>
    )}
    {!home && !preview && role === "owner" && (
      <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-zinc-200 hover:bg-zinc-800 border border-zinc-700" onClick={() => open("share")} data-testid="share-button">
        <Share2 size={15} /> Share
      </button>
    )}
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-1.5 p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 text-sm" aria-label="Account" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)} data-testid="account-menu">
        <UserRound size={18} /><span className="hidden xl:inline max-w-[120px] truncate">{user.displayName}</span>
      </button>
      {menu && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-50" role="menu">
          <div className="px-3 py-1.5 text-[12px] text-zinc-500 truncate">{user.username}</div>
          <button className={item} role="menuitem" onClick={() => { setMenu(false); open("account"); }}><UserRound size={15} /> Account</button>
          {user.isAdmin && <button className={item} role="menuitem" onClick={() => { setMenu(false); open("people"); }}><Users size={15} /> People</button>}
          <div className="border-t border-zinc-800 my-1" />
          <button className={item} role="menuitem" onClick={() => { setMenu(false); void signOut(); }}><LogOut size={15} /> Sign out</button>
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
    ...(c.role === "editor" && c.draft ? [{ label: c.approval ? "Send your changes" : "Publish your changes", icon: <Send size={19} />, run: () => open("publish") }] : []),
    ...(c.role === "owner" && c.pending ? [{ label: `${c.pending} to review`, icon: <Inbox size={19} />, run: () => open("review") }] : []),
    ...(c.id && (c.role === "owner" || c.role === "editor") ? [{ label: "History", icon: <History size={19} />, run: () => open("history") }] : [])
  ];
  return [
    ...work,
    { label: "Courses", icon: <LayoutGrid size={19} />, run: () => { useAuth.getState().showHome(true); void saveNow().then(thumbnailNow).then(() => useAuth.getState().bump()); } },
    { label: "Share", icon: <Share2 size={19} />, run: () => open("share") },
    { label: "Account", icon: <UserRound size={19} />, run: () => open("account") },
    ...(user.isAdmin ? [{ label: "People", icon: <Users size={19} />, run: () => open("people") }] : []),
    { label: "Sign out", icon: <LogOut size={19} />, run: () => void signOut() }
  ];
}
