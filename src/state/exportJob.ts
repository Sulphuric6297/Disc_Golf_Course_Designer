// One export at a time: what is being made (for the progress bar and Cancel, shown wherever the
// person is in the app), and running an export with its errors shown as toasts. It lives outside
// the Export step's panel, so leaving the step doesn't stop or break an export.
import { create } from "zustand";
import { toast } from "./toast";

export type ExportJob = {
  id: number;
  label: string;
  kind: "file" | "video";
  /** 0..1, or null while it can't be told. */
  progress: number | null;
  cancel: (() => void) | null;
};

export const useExportJob = create<{ job: ExportJob | null }>(() => ({ job: null }));

export type JobControl = {
  signal: AbortSignal;
  /** Moves the progress bar (and changes the label, if given). */
  progress: (fraction: number | null, label?: string) => void;
};

let nextId = 1;

export const isCancel = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

/** Runs an export unless another one is running; returns whether it finished. */
export const runExport = async (label: string, fn: (job: JobControl) => Promise<void> | void, opts: { kind?: ExportJob["kind"]; cancellable?: boolean } = {}) => {
  const running = useExportJob.getState().job;
  if (running) {
    toast(`Still making "${running.label}".`, "info");
    return false;
  }
  const ctrl = new AbortController();
  const id = nextId++;
  useExportJob.setState({ job: { id, label, kind: opts.kind ?? "file", progress: null, cancel: opts.cancellable ? () => ctrl.abort() : null } });
  let shown = -1;
  const progress = (fraction: number | null, newLabel?: string) => {
    const job = useExportJob.getState().job;
    if (!job || job.id !== id) return;
    // Every half percent is plenty for a progress bar
    if (newLabel === undefined && fraction !== null && fraction < 1 && Math.abs(fraction - shown) < 0.005) return;
    shown = fraction ?? -1;
    useExportJob.setState({ job: { ...job, progress: fraction, label: newLabel ?? job.label } });
  };
  try {
    await fn({ signal: ctrl.signal, progress });
    return true;
  } catch (err) {
    if (ctrl.signal.aborted || isCancel(err)) toast(`Cancelled: ${label}.`, "info");
    else {
      console.error(err);
      toast(err instanceof Error ? err.message : "That export failed.", "error");
    }
    return false;
  } finally {
    if (useExportJob.getState().job?.id === id) useExportJob.setState({ job: null });
  }
};
