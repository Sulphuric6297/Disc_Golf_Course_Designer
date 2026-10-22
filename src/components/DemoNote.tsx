// The demo's note (the browser-only build, on GitHub Pages): what it keeps, and what HyzerLab on
// your own server adds. (The one explainer in the app, at the owner's request.)
import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

const REPO = "https://github.com/Sulphuric6297/Disc_Golf_Course_Designer#your-own-server-hyzerlab";

export const DEMO_ADDS = [
  "Accounts, invite-only, with two-factor sign-in",
  "Courses kept on the server, shared as owner, editor or viewer",
  "Drafts, publishing and a history to go back to",
  "Comments pinned on the map",
  "Public course pages, with what each link shows",
  "Several courses on one park's map"
];

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
      <button className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-sky-500/15 text-sky-200 border border-sky-500/30 hover:bg-sky-500/25" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="demo-note">Demo</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-zinc-900 rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 p-4 z-50 text-sm" role="dialog" aria-label="The demo">
          <p className="text-zinc-100 font-semibold">The demo</p>
          <p className="text-zinc-300 mt-1">Everything to design a course, kept in this browser.</p>
          <p className="text-zinc-100 font-semibold mt-3">On your own server, HyzerLab adds</p>
          <ul className="mt-1 space-y-1 text-zinc-300 list-disc pl-5">{DEMO_ADDS.map(a => <li key={a}>{a}</li>)}</ul>
          <a className="mt-3 inline-flex items-center gap-1.5 text-orange-300 hover:text-orange-200" href={REPO} target="_blank" rel="noreferrer">Run it yourself <ExternalLink size={13} /></a>
        </div>
      )}
    </div>
  );
}
