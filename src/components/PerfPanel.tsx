// The lag recorder's panel (lib/perfLog), shown only with #perf in the page's address: the frames
// that came late and the jobs that ran in each, to copy and send.
import { useEffect, useState, useSyncExternalStore } from "react";
import { clearLate, lateFrames, onLate, perfOn, perfReport, startPerf } from "../lib/perfLog";

export function PerfPanel() {
  const show = perfOn();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (show) startPerf(); }, [show]);
  const n = useSyncExternalStore(onLate, () => lateFrames().length);
  if (!show) return null;
  const list = lateFrames().slice(-12).reverse();
  const copy = () => { void navigator.clipboard?.writeText(perfReport()).catch(() => undefined); };
  return (
    <div className="fixed left-2 bottom-24 z-[80] max-w-[92vw] w-[340px] rounded-xl bg-black/85 text-[11px] text-zinc-100 font-mono shadow-2xl" data-testid="perf-panel">
      <button className="w-full text-left px-2.5 py-1.5 font-bold" onClick={() => setOpen(o => !o)}>Lag recorder · {n} late frames {open ? "▾" : "▸"}</button>
      {open && (
        <div className="px-2.5 pb-2 max-h-[45vh] overflow-y-auto">
          <div className="flex gap-2 mb-1.5">
            <button className="px-2 py-1 rounded bg-white/15" onClick={copy}>Copy</button>
            <button className="px-2 py-1 rounded bg-white/15" onClick={clearLate}>Clear</button>
          </div>
          {list.map(f => (
            <div key={f.at} className="border-t border-white/10 py-1">
              <b>{f.ms} ms</b> at {Math.round(f.at / 1000)} s{f.jobs.length ? "" : " · nothing timed (the browser drawing)"}
              {f.jobs.map(j => <div key={j.name} className="pl-2 text-zinc-300">{j.ms} ms {j.name}</div>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
