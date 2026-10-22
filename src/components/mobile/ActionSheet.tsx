// A menu that slides up from the bottom of a phone (the touch stand-in for a right-click menu and
// the app's menu): big rows within the thumb's reach, a title saying what it is about, and Cancel.
// It is modal: the focus moves into it and back when it closes; Esc or a tap outside closes it.
import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

export type SheetAction = { label: string; icon?: ReactNode; run: () => void; danger?: boolean; testid?: string; hint?: string };

export function ActionSheet({ title, subtitle, actions, onClose, children, testid = "action-sheet" }: { title: ReactNode; subtitle?: ReactNode; actions: SheetAction[]; onClose: () => void; children?: ReactNode; testid?: string }) {
  const box = useRef<HTMLDivElement>(null);
  // A long-press opens it under the finger: the lift that follows is not a tap on a row (only
  // presses that start once it is open count, or the keyboard)
  const armed = useRef(false);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab" && box.current) {
        // Keep the focus inside while it is open
        const f = [...box.current.querySelectorAll<HTMLElement>("button,input,select,[tabindex]")].filter(el => !el.hasAttribute("disabled"));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  const fresh = (e: ReactMouseEvent) => !armed.current && e.detail !== 0;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 animate-[dgfade_160ms_ease-out]" onPointerDownCapture={() => { armed.current = true; }} onClick={e => !fresh(e) && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Menu"}
        data-testid={testid}
        className="w-full max-w-md mx-2 mb-[max(8px,env(safe-area-inset-bottom))] animate-[dgrise_220ms_cubic-bezier(0.2,0.9,0.3,1)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="glass border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="px-4 pt-3.5 pb-2.5 text-center border-b border-white/5">
            <div className="text-[15px] font-bold text-zinc-50">{title}</div>
            {subtitle && <div className="text-[13px] text-zinc-400 mt-0.5">{subtitle}</div>}
          </div>
          {children}
          <div role="menu" className="max-h-[60dvh] overflow-y-auto dg-scroll">
            {actions.map(a => (
              <button
                key={a.label}
                role="menuitem"
                data-testid={a.testid}
                className={`w-full min-h-[52px] flex items-center gap-3 px-4 py-2 text-left text-[16px] border-t border-white/5 first:border-t-0 active:bg-white/[0.09] hover:bg-white/[0.09] focus:outline-none focus-visible:bg-white/[0.09] ${a.danger ? "text-red-300" : "text-zinc-100"}`}
                onClick={e => { if (fresh(e)) return; a.run(); onClose(); }}
              >
                {a.icon && <span className={`w-6 flex justify-center ${a.danger ? "text-red-300" : "text-zinc-400"}`}>{a.icon}</span>}
                <span className="flex-1">
                  {a.label}
                  {a.hint && <span className="block text-[13px] text-zinc-500">{a.hint}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
        <button className="mt-2 w-full min-h-[52px] rounded-2xl glass border border-white/10 text-[16px] font-semibold text-orange-300 active:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 shadow-2xl" onClick={e => !fresh(e) && onClose()} data-testid="action-sheet-cancel">
          Cancel
        </button>
      </div>
    </div>
  );
}
