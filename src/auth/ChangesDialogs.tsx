// The history, and the bar shown while looking at an earlier version.
import { useEffect, useState } from "react";
import { ArrowLeft, History, RotateCcw } from "lucide-react";
import { useAuth } from "./api";
import { compareWithNow, endPreview, listVersions, previewVersion, restoreVersion, useServerCourse, type VersionRow } from "./courses";
import { Dialog, when } from "./parts";
import { Loading } from "../components/ui";
import { toast } from "../state/toast";

/** Something started from a dialog that closed: a failure said in a notice, not lost. */
const orSay = (p: Promise<unknown>, what: string) => { void p.catch(e => toast(`${what}: ${e instanceof Error ? e.message : "try again"}.`, "error")); };
const NOT_LOADED = "Couldn't load it. Check the connection and open it again.";

// (published and drafts: versions from before live editing)
const KIND: Record<VersionRow["kind"], string> = { created: "Created", autosave: "Saved", publish: "Published", restore: "Restored", draft: "A draft" };

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const { version } = useServerCourse();
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [compared, setCompared] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => { void listVersions().then(setRows, () => { setFailed(true); setRows([]); }); }, []);
  const shown = rows ?? [];
  const label = (v: VersionRow) => `Version ${v.version} · ${KIND[v.kind]}${v.by ? ` by ${v.by}` : ""} · ${when(v.at)}`;
  return (
    <Dialog title="History" onClose={onClose} testid="history-dialog" side>
      {failed && <p role="alert" className="text-sm text-red-300">{NOT_LOADED}</p>}
      {rows === null ? <Loading label="Loading…" className="h-24" /> : !failed && shown.length === 0 ? <p className="text-sm text-zinc-400">No versions yet.</p> : (
        <ol className="divide-y divide-white/[0.08] -mx-1" data-testid="versions">
          {shown.map(v => (
            <li key={v.id} className="py-2 px-1 flex items-start gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="text-zinc-100">
                  {KIND[v.kind]}{v.by ? <span className="text-zinc-400"> by {v.by}</span> : null}
                  {v.approvedBy && <span className="text-zinc-500"> · OK'd by {v.approvedBy}</span>}
                  {v.version === version && <span className="ml-2 text-[11px] text-emerald-300">Now</span>}
                </div>
                {v.note && <div className="text-zinc-300 text-[13px]">{v.note}</div>}
                <div className="text-[12px] text-zinc-500">Version {v.version} · {when(v.at)}</div>
                {compared[v.id] && <div className="text-[12px] text-sky-300 mt-0.5" data-testid="compared">Since then: {compared[v.id]}</div>}
              </div>
              {v.version !== version && (
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs shrink-0 pt-0.5 max-w-[45%]">
                  <button className="text-zinc-300 hover:text-zinc-50" onClick={() => void previewVersion(v, label(v))} data-testid="look">Look</button>
                  <button className="text-zinc-300 hover:text-zinc-50" onClick={() => { setCompared(c => ({ ...c, [v.id]: "comparing…" })); void compareWithNow(v.id).then(t => setCompared(c => ({ ...c, [v.id]: t })), () => setCompared(c => ({ ...c, [v.id]: "couldn't compare" }))); }} data-testid="compare">Compare</button>
                  <button className="text-orange-300 hover:text-orange-200" onClick={() => { if (confirm(`Restore version ${v.version}? The course as it is now stays in the history.`)) { onClose(); orSay(restoreVersion(v.id), "Couldn't restore it"); } }}>Restore</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/** Over the map while looking at an earlier version. */
export function PreviewBar() {
  const { preview } = useServerCourse();
  // (beside the History panel when it's open, not under it)
  const beside = useAuth(s => s.dialog) === "history" ? "md:left-[calc(50%-200px)]" : "";
  const [busy, setBusy] = useState(false);
  if (!preview) return null;
  const go = (fn: () => Promise<void>) => async () => { setBusy(true); try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : "That didn't go through. Try again.", "error"); } finally { setBusy(false); } };
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
  return (
    <div className={`fixed left-1/2 -translate-x-1/2 top-[68px] z-30 ${beside} max-w-[calc(100vw-24px)] glass-solid rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 px-3 py-2 flex flex-wrap items-center gap-2`} role="region" aria-label="Looking back" data-testid="preview-bar">
      <History size={16} className="text-sky-300 shrink-0" />
      <span className="text-sm text-zinc-100 mr-2 min-w-0 truncate">{preview.label}</span>
      <button disabled={busy} className={`${btn} bg-orange-500 hover:bg-orange-400 text-zinc-950`} onClick={go(() => restoreVersion(preview.id))}><RotateCcw size={14} /> Restore</button>
      <button disabled={busy} className={`${btn} text-zinc-300 hover:bg-white/[0.09]`} onClick={go(endPreview)} data-testid="preview-back"><ArrowLeft size={14} /> Back</button>
    </div>
  );
}
