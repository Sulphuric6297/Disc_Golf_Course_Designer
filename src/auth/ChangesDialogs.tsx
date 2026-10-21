// Publishing a draft, the history, drafts sent for the owner's OK, and the bar shown while
// looking at an earlier version or a sent draft.
import { useEffect, useState } from "react";
import { ArrowLeft, Check, History, RotateCcw, X } from "lucide-react";
import { useAuth } from "./api";
import {
  acceptSubmission, declineSubmission, discardDraft, draftChanges, endPreview, listSubmissions, listVersions, prepareMerge, previewSubmission, previewVersion,
  publishDraft, restoreVersion, updateDraft, useServerCourse, type Merge, type SubmissionRow, type VersionRow
} from "./courses";
import { Dialog, Form, when } from "./parts";
import { inputCls } from "../components/ui";


/** The parts both your draft and the course changed: keep yours (the default) or the course's. */
function Clashes({ m, picked, setPicked }: { m: Merge; picked: Set<number>; setPicked: (s: Set<number>) => void }) {
  if (!m.clashes.length) return null;
  const pick = (i: number, theirs: boolean) => { const n = new Set(picked); if (theirs) n.add(i); else n.delete(i); setPicked(n); };
  return (
    <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" data-testid="clashes">
      <p className="text-sm text-amber-100 mb-2">Changed in the course too since your draft started:</p>
      <ul className="space-y-1.5">
        {m.clashes.map((c, i) => (
          <li key={`${c.list}:${c.id}`} className="flex items-center gap-2 text-sm" data-testid="clash">
            <span className="flex-1 min-w-0 truncate text-zinc-100">{c.label}{c.mine === undefined ? " (you removed it)" : c.theirs === undefined ? " (removed in the course)" : ""}</span>
            <select className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-100" value={picked.has(i) ? "theirs" : "mine"} onChange={e => pick(i, e.target.value === "theirs")} aria-label={`Keep for ${c.label}`}>
              <option value="mine">Keep mine</option>
              <option value="theirs">Keep the course's</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublishDialog({ onClose }: { onClose: () => void }) {
  const { approval, role } = useServerCourse();
  const sending = approval && role !== "owner";
  const [note, setNote] = useState("");
  const [m, setM] = useState<Merge | null>(null);
  const [picked, setPicked] = useState(new Set<number>());
  useEffect(() => { if (!sending) void prepareMerge().then(setM); }, [sending]);
  const summary = draftChanges();
  return (
    <Dialog title={sending ? "Send your changes" : "Publish your changes"} onClose={onClose} testid="publish-dialog">
      <p className="text-sm text-zinc-300 mb-3" data-testid="draft-changes">{summary}</p>
      {m && <Clashes m={m} picked={picked} setPicked={setPicked} />}
      <Form compact submit={sending ? "Send to the owner" : "Publish"} testid="publish-form" onSubmit={async () => { await publishDraft(note, m, picked); onClose(); }}>
        <label className="block">
          <span className="block text-xs font-medium text-zinc-300 mb-1">Name (optional)</span>
          <input className={inputCls} value={note} maxLength={200} placeholder={summary} onChange={e => setNote(e.target.value)} />
        </label>
      </Form>
      <button className="mt-4 text-xs text-red-300 hover:text-red-200" onClick={() => { if (confirm("Throw away your draft?")) void discardDraft().then(onClose); }} data-testid="discard-draft">Discard draft</button>
    </Dialog>
  );
}

/** The course's changes since your draft started, brought into the draft. */
export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const [m, setM] = useState<Merge | null>(null);
  const [picked, setPicked] = useState(new Set<number>());
  useEffect(() => { void prepareMerge().then(setM); }, []);
  return (
    <Dialog title="Update your draft" onClose={onClose} testid="update-dialog">
      <p className="text-sm text-zinc-300 mb-3">The course changed since your draft started. Its changes go into your draft.</p>
      {m ? (
        <>
          <Clashes m={m} picked={picked} setPicked={setPicked} />
          <Form compact submit="Update draft" testid="update-form" onSubmit={async () => { await updateDraft(m, picked); onClose(); }}>{null}</Form>
        </>
      ) : <div className="h-10" aria-busy="true" />}
    </Dialog>
  );
}

const KIND: Record<VersionRow["kind"], string> = { created: "Created", autosave: "Saved", publish: "Published", restore: "Restored" };

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const { role, approval, version } = useServerCourse();
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  useEffect(() => { void listVersions().then(setRows, () => setRows([])); }, []);
  const canRestore = role === "owner" || !approval;
  const label = (v: VersionRow) => `Version ${v.version} · ${KIND[v.kind]}${v.by ? ` by ${v.by}` : ""} · ${when(v.at)}`;
  return (
    <Dialog title="History" onClose={onClose} testid="history-dialog">
      {rows === null ? <div className="h-24" aria-busy="true" /> : (
        <ol className="divide-y divide-zinc-800 -mx-1" data-testid="versions">
          {rows.map(v => (
            <li key={v.id} className="py-2 px-1 flex items-start gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="text-zinc-100">
                  {KIND[v.kind]}{v.by ? <span className="text-zinc-400"> by {v.by}</span> : null}
                  {v.approvedBy && <span className="text-zinc-500"> · OK'd by {v.approvedBy}</span>}
                  {v.version === version && <span className="ml-2 text-[11px] text-emerald-300">Now</span>}
                </div>
                {v.note && <div className="text-zinc-300 text-[13px]">{v.note}</div>}
                <div className="text-[12px] text-zinc-500">Version {v.version} · {when(v.at)}</div>
              </div>
              {v.version !== version && (
                <div className="flex gap-3 text-xs shrink-0 pt-0.5">
                  <button className="text-zinc-300 hover:text-white" onClick={() => { onClose(); void previewVersion(v, label(v)); }}>Look</button>
                  {canRestore && <button className="text-orange-300 hover:text-orange-200" onClick={() => { if (confirm(`Restore version ${v.version}? The course as it is now stays in the history${useServerCourse.getState().draft ? ", and your draft is discarded" : ""}.`)) { onClose(); void restoreVersion(v.id); } }}>Restore</button>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

export function ReviewDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [error, setError] = useState("");
  const refresh = () => listSubmissions().then(setRows, () => setRows([]));
  useEffect(() => { void refresh(); }, []);
  const act = async (fn: () => Promise<void>) => {
    setError("");
    try { await fn(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  };
  return (
    <Dialog title="Sent for your OK" onClose={onClose} testid="review-dialog">
      {rows === null ? <div className="h-24" aria-busy="true" /> : rows.length === 0 ? <p className="text-sm text-zinc-400">Nothing waiting.</p> : (
        <ul className="divide-y divide-zinc-800" data-testid="submissions">
          {rows.map(s => (
            <li key={s.id} className="py-2 flex items-start gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="text-zinc-100">{s.by ?? "Someone"}</div>
                {s.note && <div className="text-zinc-300 text-[13px]">{s.note}</div>}
                <div className="text-[12px] text-zinc-500">{when(s.createdAt)}</div>
              </div>
              <div className="flex gap-3 text-xs shrink-0 pt-0.5">
                <button className="text-zinc-300 hover:text-white" onClick={() => { onClose(); void previewSubmission(s, `${s.by ?? "Someone"}'s changes${s.note ? `: ${s.note}` : ""}`); }}>Look</button>
                <button className="text-emerald-300 hover:text-emerald-200" onClick={() => void act(() => acceptSubmission(s.id))}>Accept</button>
                <button className="text-red-300 hover:text-red-200" onClick={() => void act(() => declineSubmission(s.id))}>Decline</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </Dialog>
  );
}

/** Over the map while looking at an earlier version or a sent draft. */
export function PreviewBar() {
  const { preview, role, approval, behind, draft } = useServerCourse();
  const me = useAuth(s => s.session?.user?.id);
  const open = useAuth(s => s.open);
  const [busy, setBusy] = useState(false);
  // (in a draft that the course moved on from: bring its changes in)
  if (!preview && behind && draft) {
    return (
      <div className="fixed left-1/2 -translate-x-1/2 top-[68px] z-30 max-w-[calc(100vw-24px)] bg-zinc-900/95 border border-sky-700/60 rounded-xl shadow-2xl px-3 py-2 flex flex-wrap items-center gap-2" role="region" aria-label="Course changed" data-testid="behind-bar">
        <span className="text-sm text-zinc-100 mr-2">The course changed since your draft started</span>
        <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white" onClick={() => open("update")} data-testid="update-draft">Update draft</button>
      </div>
    );
  }
  if (!preview) return null;
  const go = (fn: () => Promise<void>) => async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-[68px] z-30 max-w-[calc(100vw-24px)] bg-zinc-900/95 border border-zinc-700 rounded-xl shadow-2xl px-3 py-2 flex flex-wrap items-center gap-2" role="region" aria-label="Looking back" data-testid="preview-bar">
      <History size={16} className="text-sky-300 shrink-0" />
      <span className="text-sm text-zinc-100 mr-2 min-w-0 truncate">{preview.label}</span>
      {preview.kind === "version" && (role === "owner" || !approval) && (
        <button disabled={busy} className={`${btn} bg-orange-500 hover:bg-orange-400 text-white`} onClick={go(() => restoreVersion(preview.id))}><RotateCcw size={14} /> Restore</button>
      )}
      {preview.kind === "submission" && role === "owner" && (
        <>
          <button disabled={busy} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`} onClick={go(() => acceptSubmission(preview.id))}><Check size={14} /> Accept</button>
          <button disabled={busy} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700`} onClick={go(() => declineSubmission(preview.id))}><X size={14} /> Decline</button>
        </>
      )}
      {preview.kind === "submission" && role !== "owner" && me && (
        <button disabled={busy} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700`} onClick={go(() => declineSubmission(preview.id))}>Take back</button>
      )}
      <button disabled={busy} className={`${btn} text-zinc-300 hover:bg-zinc-800`} onClick={go(endPreview)} data-testid="preview-back"><ArrowLeft size={14} /> Back</button>
    </div>
  );
}
