// Pieces shared by the sign-in screens and the account dialogs.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { inputCls } from "../components/ui";
import { ApiFail } from "./api";

export const Logo = ({ size = 40 }: { size?: number }) => (
  // (the badge: a fairway through the woods at sunrise)
  <img src={`${import.meta.env.BASE_URL}logo-128.png`} width={size} height={size} alt="" aria-hidden className="block rounded-full shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" draggable={false} />
);

/** A form that shows what went wrong and is busy while it sends. `compact`: a small button (in
 * dialogs), not the full-width one of the sign-in screens. */
export function Form({ onSubmit, submit, children, testid, compact }: { onSubmit: () => Promise<void>; submit: string; children: ReactNode; testid?: string; compact?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try { await onSubmit(); } catch (err) { setError(err instanceof ApiFail || err instanceof Error ? err.message : "Something went wrong"); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className="space-y-3" data-testid={testid} noValidate>
      {children}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button type="submit" disabled={busy} className={`inline-flex items-center justify-center rounded-lg font-semibold text-sm text-zinc-950 disabled:opacity-50 ${compact ? "px-3 py-1.5 touch:py-2.5 bg-white/[0.12] hover:bg-orange-500" : "w-full px-3 py-2 touch:py-3 bg-orange-500 hover:bg-orange-400 shadow"}`}>
        {submit}
      </button>
    </form>
  );
}

export const Input = ({ label, value, onChange, type = "text", auto, mono }: { label: string; value: string; onChange: (v: string) => void; type?: string; auto?: string; mono?: boolean }) => (
  <label className="block">
    <span className="block text-xs touch:text-[13px] font-medium text-zinc-300 mb-1">{label}</span>
    <input className={`${inputCls} ${mono ? "font-mono tracking-wider" : ""}`} type={type} value={value} autoComplete={auto} spellCheck={false} autoCapitalize="none" onChange={e => onChange(e.target.value)} />
  </label>
);

/** A full screen with one card in the middle: the sign-in screens. */
export const Screen = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="relative isolate min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-4 overflow-hidden">
    {/* (the woods at sunrise, behind the sign-in: clear, darkened toward the foot for the card) */}
    <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}backdrop/forest.jpg)` }} aria-hidden />
    <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-black/25 to-black/60" aria-hidden />
    <main className="glass w-full max-w-sm rounded-[28px] p-6">
      <div className="flex items-center gap-3 mb-5">
        <Logo />
        <div>
          <div className="text-zinc-50 font-bold text-lg leading-tight">HyzerLab</div>
          <h1 className="text-zinc-400 text-sm">{title}</h1>
        </div>
      </div>
      {children}
    </main>
  </div>
);

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg font-semibold px-2.5 py-1 text-xs touch:py-2.5 bg-white/[0.07] hover:bg-white/[0.13] text-zinc-100 border border-white/[0.12]"
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </button>
  );
}

export function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`HyzerLab backup codes\n\n${text}\n`], { type: "text/plain" }));
    a.download = "hyzerlab-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div data-testid="backup-codes">
      <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm text-zinc-100 bg-zinc-950 border border-white/[0.08] rounded-lg p-3 mb-2">
        {codes.map(c => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <CopyButton text={text} />
        <button type="button" onClick={download} className="inline-flex items-center rounded-lg font-semibold px-2.5 py-1 text-xs touch:py-2.5 bg-white/[0.07] hover:bg-white/[0.13] text-zinc-100 border border-white/[0.12]">Download</button>
      </div>
    </div>
  );
}

/** A dialog over the app: Esc, the close button or a click outside closes it. */
/** `side`: on a computer a panel down the right (the course stays in view and can be used);
 * on a phone the usual sheet. */
export function Dialog({ title, onClose, children, wide, testid, side }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; testid?: string; side?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("keydown", esc, true); before?.focus?.({ preventScroll: true }); };
  }, []);
  if (side) {
    return (
      <>
        {/* (a phone: the sheet's backdrop; a computer: none, the map stays live) */}
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onClose} />
        <div ref={box} className="fixed z-50 bottom-0 inset-x-0 md:inset-x-auto md:right-0 md:top-12 md:bottom-0 md:w-[400px] glass shadow-2xl ring-1 ring-white/10 rounded-t-[22px] md:rounded-none max-h-[92dvh] md:max-h-none overflow-y-auto p-5 pb-[max(20px,env(safe-area-inset-bottom))]" role="dialog" aria-label={title} data-testid={testid}>
          <div className="flex items-center mb-4">
            <h2 className="font-semibold text-zinc-50 text-base flex-1">{title}</h2>
            <button aria-label="Close" className="text-zinc-400 hover:text-white touch:w-11 touch:h-11 touch:-m-2.5 touch:flex touch:items-center touch:justify-center" onClick={onClose}><X size={18} /></button>
          </div>
          {children}
        </div>
      </>
    );
  }
  return (
    <div ref={box} className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose} data-testid={testid}>
      <div className={`glass shadow-2xl ring-1 ring-white/10 w-full rounded-t-[22px] md:rounded-2xl max-h-[92dvh] overflow-y-auto pb-[max(20px,env(safe-area-inset-bottom))] md:pb-5 p-5 ${wide ? "md:max-w-3xl" : "md:max-w-lg"}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center mb-4">
          <h2 className="font-semibold text-zinc-50 text-base flex-1">{title}</h2>
          <button aria-label="Close" className="text-zinc-400 hover:text-zinc-50 touch:w-11 touch:h-11 touch:-m-2.5 touch:flex touch:items-center touch:justify-center" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const when = (d: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
