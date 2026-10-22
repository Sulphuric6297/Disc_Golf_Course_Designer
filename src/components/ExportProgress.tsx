// What is being exported, with its progress and Cancel: at the top of the Export step, and as a
// small pill over the map when the person is elsewhere (an export goes on when they leave the step).
import { Loader2, X } from "lucide-react";
import { useExportJob } from "../state/exportJob";
import { useEditor } from "../state/course";

export function ProgressBar({ value, testid, label }: { value: number | null; testid?: string; label: string }) {
  const pct = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="h-1.5 rounded-full bg-zinc-700/80 overflow-hidden" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} data-testid={testid}>
      <div className={`h-full bg-orange-400 transition-[width] duration-200 ${pct === null ? "w-1/3 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

/** At the top of the Export step. */
export function ExportBanner() {
  const job = useExportJob(s => s.job);
  if (!job) return null;
  return (
    <div className="sticky top-0 z-10 mx-4 mt-2 text-sm text-orange-100 bg-zinc-900/95 border border-orange-500/40 rounded-lg px-3 py-2 shadow-lg" data-testid="export-busy">
      <div className="flex items-center gap-2">
        <Loader2 size={15} className="animate-spin text-orange-300 shrink-0" />
        <span className="flex-1 min-w-0 truncate">{job.label}{job.progress !== null ? ` · ${Math.round(job.progress * 100)}%` : "…"}</span>
        {job.cancel && <button className="text-xs font-semibold text-orange-300 hover:text-orange-200" onClick={job.cancel} data-testid="export-cancel">Cancel</button>}
      </div>
      {job.progress !== null && <div className="mt-1.5"><ProgressBar value={job.progress} label={job.label} /></div>}
    </div>
  );
}

/** Over the map, when the Export step isn't showing (or the view from a tee is). */
export function ExportProgressPill({ top }: { top?: number }) {
  const job = useExportJob(s => s.job);
  const elsewhere = useEditor(s => s.step !== "export" || !!s.teeView);
  if (!job || !elsewhere) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[300px] max-w-[calc(100%-16px)] bg-zinc-950/90 backdrop-blur border border-zinc-700 rounded-xl px-3 py-2 shadow-2xl text-zinc-100" style={top !== undefined ? { top } : undefined} data-testid="export-progress-pill">
      <div className="flex items-center gap-2 text-xs">
        <Loader2 size={14} className="animate-spin text-orange-300 shrink-0" />
        <span className="flex-1 min-w-0 truncate font-semibold">{job.label}</span>
        {job.progress !== null && <span className="tabular-nums text-zinc-300">{Math.round(job.progress * 100)}%</span>}
        {job.cancel && (
          <button className="ml-1 p-0.5 rounded text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800" aria-label="Cancel the export" title="Cancel" onClick={job.cancel} data-testid="export-progress-cancel">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="mt-1.5"><ProgressBar value={job.progress} label={job.label} /></div>
    </div>
  );
}
