// The top bar: the course name, files (new, open, save, recent), the steps and 2D/3D.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, FilePlus, FolderOpen, HelpCircle, Save, Search, Trash2 } from "lucide-react";
import { STEPS } from "./SidePanel";
import { changeDoc, useCourse, useEditor } from "../state/course";
import { deleteRecent, newCourse, openCourseFile, openRecent, recentCourses, saveCourseFile } from "../state/files";
import type { PlanMeta } from "../lib/storage";
import { AccountMenu, goHome } from "../auth/AccountMenu";
import { SERVER } from "../auth/api";

const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="30" fill="#f97316" />
    <path d="M17 24h30M19 24l4 17h18l4-17M32 10v44M24 41l8 9 8-9" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Header({ onHelp, onGoTo }: { onHelp: () => void; onGoTo: () => void }) {
  const name = useCourse(s => s.doc.name);
  // (view only: the name as text, and no steps)
  const readOnly = useCourse(s => s.readOnly);
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

  const item = "w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 text-left";
  return (
    <header className="h-14 shrink-0 bg-zinc-950 border-b border-zinc-800 flex items-center gap-3 px-3 z-30">
      {SERVER ? <button className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" aria-label="Courses" title="Courses" onClick={goHome} data-testid="logo-home"><Logo /></button> : <Logo />}
      <div className="flex items-center gap-1 min-w-0">
        {readOnly ? <span className="text-zinc-50 font-bold text-[15px] px-1.5 py-1 max-w-[230px] truncate" data-testid="course-title">{name}</span> : <input
          aria-label="Course name"
          className="bg-transparent text-zinc-50 font-bold text-[15px] px-1.5 py-1 rounded hover:bg-zinc-900 focus:bg-zinc-900 focus:outline-none w-[160px] xl:w-[230px] truncate"
          value={name}
          onChange={e => changeDoc(() => ({ name: e.target.value }), false)}
          onBlur={() => useCourse.getState().commit()}
        />}
        <div className="relative" ref={menuRef}>
          <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu} data-testid="file-menu">
            File <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-50" role="menu">
              <button className={item} role="menuitem" onClick={() => { setMenu(false); void newCourse(); }}><FilePlus size={15} /> New course</button>
              <button className={item} role="menuitem" onClick={() => { setMenu(false); fileRef.current?.click(); }}><FolderOpen size={15} /> Open a course file…</button>
              <button className={item} role="menuitem" onClick={() => { setMenu(false); saveCourseFile(); }}><Save size={15} /> Save as a file</button>
              <div className="border-t border-zinc-800 my-1" />
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{SERVER ? "Courses" : "Recent courses"}</div>
              {recent.length === 0 && <div className="px-3 py-1.5 text-xs text-zinc-500">None yet.</div>}
              {recent.map(r => (
                <div key={r.id} className="flex items-center hover:bg-zinc-800" data-testid="recent-course">
                  <button className="flex-1 text-left px-3 py-1.5 text-sm text-zinc-200" onClick={() => { setMenu(false); void openRecent(r.id); }}>
                    {r.name}
                    <span className="block text-[11px] text-zinc-500">{r.holes} hole{r.holes === 1 ? "" : "s"} · {new Date(r.updatedAt).toLocaleDateString()}</span>
                  </button>
                  <button className="p-2 text-zinc-500 hover:text-red-400" aria-label={`Delete ${r.name}`} onClick={() => { void deleteRecent(r.id).then(() => recentCourses().then(setRecent)); }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".json,.dgcourse.json,application/json" className="hidden" aria-label="Open course file" onChange={e => { const f = e.target.files?.[0]; if (f) void openCourseFile(f); e.target.value = ""; }} />
      </div>

      {readOnly ? <div className="flex-1" /> : <nav aria-label="Steps" className="flex-1 min-w-0 flex justify-center overflow-hidden">
        <ol className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-0.5">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => ed.set({ step: s.id, tool: "select" })}
                aria-current={ed.step === s.id ? "step" : undefined}
                className={`flex items-center gap-1.5 px-2 xl:px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${ed.step === s.id ? "bg-orange-500 text-white" : "text-zinc-300 hover:bg-zinc-800"}`}
              >
                <span className={`w-[18px] h-[18px] rounded-full text-[10px] flex items-center justify-center ${ed.step === s.id ? "bg-white/25" : "bg-zinc-800"}`}>{i + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>}

      <div className="flex items-center gap-2">
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1" role="radiogroup" aria-label="View">
          {(["2d", "3d"] as const).map(v => (
            <button key={v} role="radio" aria-checked={ed.view === v} onClick={() => ed.set({ view: v })} title={v === "2d" ? "Top-down map (2)" : "Tilted 3D view (3)"} className={`px-3 py-1 rounded-lg text-sm font-bold ${ed.view === v ? "bg-sky-600 text-white" : "text-zinc-300 hover:bg-zinc-800"}`}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={onGoTo} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" aria-label="Go to" title="Go to (Ctrl+K)" data-testid="goto-button"><Search size={18} /></button>
        <button onClick={onHelp} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" aria-label="Keyboard shortcuts and help" title="Shortcuts and help (?)"><HelpCircle size={18} /></button>
        <AccountMenu />
      </div>
    </header>
  );
}
