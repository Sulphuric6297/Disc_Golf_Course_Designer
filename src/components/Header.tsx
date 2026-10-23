// The top bar, kept to a few things: the logo, the course's name with its menu (new, open, save
// as a file, the courses opened before), the steps in the middle, and on the right the search,
// then the course's state and the account (on a server) or the demo note. 2D/3D and the
// light live with the map's own controls.
import { ProblemsCount } from "./SidePanel";
import { useEffect, useRef, useState } from "react";
import { openGettingStarted, useStart } from "./GettingStarted";
import { ChevronDown, FilePlus, FolderOpen, HelpCircle, ListChecks, Save, Search, Trash2, MapPin, Route, Palette, Download } from "lucide-react";
import { STEPS } from "./SidePanel";
import { changeDoc, useCourse, useEditor } from "../state/course";
import { deleteRecent, newCourse, openCourseFile, openRecent, recentCourses, saveCourseFile } from "../state/files";
import type { PlanMeta } from "../lib/storage";
import { AccountMenu, goHome } from "../auth/AccountMenu";
import { useAllowed } from "../auth/perms";
import { DemoNote } from "./DemoNote";
import { CoursePageButton, SITE_TOKEN } from "../auth/PublicSite";
import { SERVER } from "../auth/api";
import { FOCUS, MENU_HEAD, MenuRow, POPOVER } from "./ui";

const Logo = ({ size = 26 }: { size?: number }) => (
  // (the badge: a fairway through the woods at sunrise)
  <img src={`${import.meta.env.BASE_URL}logo-128.png`} width={size} height={size} alt="" aria-hidden className="block rounded-full shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" draggable={false} />
);

/** The icon buttons along the bar. */
export const BAR_BUTTON = `p-2 rounded-full text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.08] ${FOCUS}`;
/** Each step's mark on the steps bar. */
const STEP_ICONS = { site: MapPin, design: Route, map: Palette, export: Download } as const;

/** Getting started, at the top: opens the list (lit while it's open). */
function StartButton() {
  const open = useStart(s => s.open);
  return (
    <button onClick={() => (open ? useStart.getState().set({ open: false }) : openGettingStarted())} className={`${BAR_BUTTON} ${open ? "!text-orange-300" : ""}`} aria-label="Getting started" aria-pressed={open} title="Getting started: the main things to do" data-testid="start-button"><ListChecks size={18} /></button>
  );
}

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
    <header className="glass relative h-[50px] shrink-0 mx-2.5 mt-2.5 rounded-[22px] flex items-center gap-2 pl-2.5 pr-2 z-30">
      {/* (a course page's visitor: back to the page, not to a course list they don't have) */}
      {SITE_TOKEN ? <><CoursePageButton /><Logo /></> : SERVER ? <button className={`shrink-0 rounded-full ${FOCUS}`} aria-label="Courses" title="Courses" onClick={goHome} data-testid="logo-home"><Logo /></button> : <Logo />}
      <div className="flex items-center min-w-0" ref={menuRef}>
        {readOnly ? <span className="text-zinc-50 font-semibold text-sm px-1.5 py-1 max-w-[230px] truncate" data-testid="course-title">{name}</span> : <input
          aria-label="Course name"
          className={`bg-transparent text-zinc-50 font-semibold text-sm px-1.5 py-1 rounded-lg hover:bg-white/[0.07] focus:bg-white/[0.07] w-[150px] xl:w-[220px] truncate ${FOCUS}`}
          value={name}
          onChange={e => changeDoc(() => ({ name: e.target.value }), false)}
          onBlur={() => useCourse.getState().commit()}
        />}
        {!SITE_TOKEN && <div className="relative">
          <button className={`p-1 rounded-lg text-zinc-400 hover:text-zinc-50 hover:bg-white/[0.07] ${FOCUS}`} onClick={() => setMenu(m => !m)} aria-label="Course menu" title="New, open, save as a file…" aria-haspopup="menu" aria-expanded={menu} data-testid="file-menu">
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
                <div key={r.id} className="flex items-center hover:bg-white/[0.09]" data-testid="recent-course">
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
        <ol className="flex items-center gap-0.5 p-[3px] rounded-full bg-white/[0.06]">
          {STEPS.map((s, i) => {
            const on = ed.step === s.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => ed.set({ step: s.id, tool: "select" })}
                  aria-current={on ? "step" : undefined}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-[5px] rounded-full text-[13px] transition-colors ${FOCUS} ${on ? "bg-white/[0.16] text-zinc-50 font-semibold shadow-[inset_0_0.5px_0_rgba(255,255,255,0.25)]" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]"}`}
                >
                  {(() => { const Icon = STEP_ICONS[s.id]; return <Icon size={14} strokeWidth={2} className={on ? "text-orange-300" : ""} aria-hidden />; })()}
                  <span className="sr-only">{i + 1} </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>}

      <div className="flex items-center gap-1">
        {ed.step === "design" && !readOnly && <ProblemsCount />}
        <button onClick={onGoTo} className={BAR_BUTTON} aria-label="Go to" title="Go to (Ctrl+K)" data-testid="goto-button"><Search size={18} /></button>
        {!readOnly && <StartButton />}
        <button onClick={onHelp} className={BAR_BUTTON} aria-label="Help guide" title="Help guide (?)" data-testid="help-button"><HelpCircle size={18} /></button>
        {SERVER ? <AccountMenu onHelp={onHelp} /> : <DemoNote />}
      </div>
    </header>
  );
}
