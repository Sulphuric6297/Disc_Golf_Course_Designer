// The top bar, kept to a few things: the logo, the course's name with its menu (new, open, save
// as a file, the courses opened before), the steps in the middle, and on the right the search,
// then the course's state and the account (on a server) or the demo note. 2D/3D and the
// light live with the map's own controls.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, FilePlus, FolderOpen, HelpCircle, Save, Search, Trash2 } from "lucide-react";
import { STEPS } from "./SidePanel";
import { changeDoc, useCourse, useEditor } from "../state/course";
import { deleteRecent, newCourse, openCourseFile, openRecent, recentCourses, saveCourseFile } from "../state/files";
import type { PlanMeta } from "../lib/storage";
import { AccountMenu, goHome } from "../auth/AccountMenu";
import { useAllowed } from "../auth/perms";
import { DemoNote } from "./DemoNote";
import { SITE_TOKEN } from "../auth/PublicSite";
import { SERVER } from "../auth/api";
import { FOCUS, MENU_HEAD, MenuRow, POPOVER } from "./ui";

const Logo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="30" fill="#f97316" />
    <path d="M17 24h30M19 24l4 17h18l4-17M32 10v44M24 41l8 9 8-9" stroke="#18181b" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The icon buttons along the bar. */
export const BAR_BUTTON = `p-2 rounded-lg text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 ${FOCUS}`;

export function Header({ onHelp, onGoTo }: { onHelp: () => void; onGoTo: () => void }) {
  const name = useCourse(s => s.doc.name);
  // (view only: the name as text, and no steps)
  const readOnly = useCourse(s => s.readOnly);
  // (a viewer: only the files they may have)
  const mayFiles = useAllowed("downloads");
  const ed = useEditor();
  const [menu, setMenu] = useState(false);
  const [recent, setRecent] = useState<PlanMeta[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    void recentCourses().then(setRecent);
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [menu]);

  return (
    <header className="h-12 shrink-0 bg-zinc-950 flex items-center gap-2 px-3 z-30 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
      {SERVER ? <button className={`shrink-0 rounded-full ${FOCUS}`} aria-label="Courses" title="Courses" onClick={goHome} data-testid="logo-home"><Logo /></button> : <Logo />}
      <div className="flex items-center min-w-0" ref={menuRef}>
        {readOnly ? <span className="text-zinc-50 font-semibold text-sm px-1.5 py-1 max-w-[230px] truncate" data-testid="course-title">{name}</span> : <input
          aria-label="Course name"
          className={`bg-transparent text-zinc-50 font-semibold text-sm px-1.5 py-1 rounded-md hover:bg-zinc-900 focus:bg-zinc-900 w-[150px] xl:w-[220px] truncate ${FOCUS}`}
          value={name}
          onChange={e => changeDoc(() => ({ name: e.target.value }), false)}
          onBlur={() => useCourse.getState().commit()}
        />}
        {!SITE_TOKEN && <div className="relative">
          <button className={`p-1 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 ${FOCUS}`} onClick={() => setMenu(m => !m)} aria-label="Course menu" title="New, open, save as a file…" aria-haspopup="menu" aria-expanded={menu} data-testid="file-menu">
            <ChevronDown size={14} />
          </button>
          {menu && (
            <div className={`absolute left-0 top-full mt-1 w-72 ${POPOVER} py-1 z-50`} role="menu">
              <MenuRow icon={<FilePlus size={15} />} onClick={() => { setMenu(false); void newCourse(); }}>New course</MenuRow>
              <MenuRow icon={<FolderOpen size={15} />} onClick={() => { setMenu(false); fileRef.current?.click(); }}>Open a course file…</MenuRow>
              {mayFiles && <MenuRow icon={<Save size={15} />} onClick={() => { setMenu(false); saveCourseFile(); }}>Save as a file</MenuRow>}
              <div className={MENU_HEAD}>{SERVER ? "Courses" : "Recent courses"}</div>
              {recent.length === 0 && <div className="px-3 py-1.5 text-xs text-zinc-500">None yet.</div>}
              {recent.map(r => (
                <div key={r.id} className="flex items-center hover:bg-zinc-800" data-testid="recent-course">
                  <button className={`flex-1 text-left px-3 py-1.5 text-sm text-zinc-200 ${FOCUS}`} onClick={() => { setMenu(false); void openRecent(r.id); }}>
                    {r.name}
                    <span className="block text-[11px] text-zinc-500">{r.holes} hole{r.holes === 1 ? "" : "s"} · {new Date(r.updatedAt).toLocaleDateString()}</span>
                  </button>
                  <button className={`p-2 text-zinc-500 hover:text-red-300 ${FOCUS} rounded-md`} aria-label={`Delete ${r.name}`} onClick={() => { void deleteRecent(r.id).then(() => recentCourses().then(setRecent)); }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>}
        <input ref={fileRef} type="file" accept=".json,.dgcourse.json,application/json" className="hidden" aria-label="Open course file" onChange={e => { const f = e.target.files?.[0]; if (f) void openCourseFile(f); e.target.value = ""; }} />
      </div>

      {readOnly ? <div className="flex-1" /> : <nav aria-label="Steps" className="flex-1 min-w-0 flex justify-center overflow-hidden">
        <ol className="flex items-center gap-0.5">
          {STEPS.map((s, i) => {
            const on = ed.step === s.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => ed.set({ step: s.id, tool: "select" })}
                  aria-current={on ? "step" : undefined}
                  className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1 rounded-md text-[13px] transition-colors ${FOCUS} ${on ? "bg-zinc-800 text-zinc-50 font-semibold" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"}`}
                >
                  <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${on ? "bg-orange-500 text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}>{i + 1}</span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>}

      <div className="flex items-center gap-1">
        <button onClick={onGoTo} className={BAR_BUTTON} aria-label="Go to" title="Go to (Ctrl+K)" data-testid="goto-button"><Search size={18} /></button>
        {SERVER ? <AccountMenu onHelp={onHelp} /> : (
          <>
            <button onClick={onHelp} className={BAR_BUTTON} aria-label="Keyboard shortcuts and help" title="Shortcuts and help (?)"><HelpCircle size={18} /></button>
            <DemoNote />
          </>
        )}
      </div>
    </header>
  );
}
