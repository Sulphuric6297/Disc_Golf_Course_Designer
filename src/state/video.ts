// Flyover videos: the chosen size and frame rate (kept for next time, and used by the Record
// button over the flyover), and recording one.
import { create } from "zustand";
import { getView } from "../components/MapViewport";
import { holeNumber } from "../lib/course";
import { VIDEO_SIZES, videoSuffix, type VideoFps, type VideoResolution } from "../lib/video";
import { runExport } from "./exportJob";
import { getDoc, useCourse } from "./course";
import { download, fileName } from "./files";
import { toast } from "./toast";

type VideoSettings = {
  resolution: VideoResolution;
  fps: VideoFps;
  /** Any other size (for the automated tests: a small video renders quickly). */
  size?: { width: number; height: number } | null;
  set: (patch: Partial<Omit<VideoSettings, "set">>) => void;
};

const KEY = "dg.video";
const saved = (): Partial<VideoSettings> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...(v.resolution in VIDEO_SIZES ? { resolution: v.resolution } : {}), ...(v.fps === 30 || v.fps === 60 ? { fps: v.fps } : {}) };
  } catch {
    return {};
  }
};

export const useVideoSettings = create<VideoSettings>()(set => ({
  resolution: "1080p",
  fps: 30,
  size: null,
  ...(typeof localStorage !== "undefined" ? saved() : {}),
  set: patch => {
    set(patch);
    const { resolution, fps } = useVideoSettings.getState();
    try { localStorage.setItem(KEY, JSON.stringify({ resolution, fps })); } catch { /* private mode */ }
  }
}));

if (typeof window !== "undefined") (window as any).__dgVideo = () => useVideoSettings.getState();

/** Records flyovers of the holes (in this order) and downloads the video. */
export const recordVideo = (holeIds: string[]) => {
  const doc = getDoc();
  const label = holeIds.length === 1 ? `Flyover video of hole ${holeNumber(doc, holeIds[0])}` : "Course flyover video";
  return runExport(label, async job => {
    const view = getView();
    if (!view) throw new Error("The map isn't ready yet.");
    const { resolution, fps, size } = useVideoSettings.getState();
    const { width, height } = size ?? VIDEO_SIZES[resolution];
    // Another course opened meanwhile: stop, rather than film the wrong one
    const ctrl = new AbortController();
    const off = useCourse.subscribe(s => { if (s.doc.id !== doc.id) ctrl.abort(); });
    job.signal.addEventListener("abort", () => ctrl.abort());
    try {
      job.progress(0);
      const video = await view.recordFlyover(holeIds, { width, height, fps, signal: ctrl.signal, onProgress: f => job.progress(f) });
      download(video.blob, fileName(doc, `${videoSuffix(doc, holeIds)}.${video.ext}`));
      toast(`Flyover video saved: ${Math.round(video.seconds)} s, ${width} × ${height}, ${video.ext.toUpperCase()}.`, "success");
    } catch (err) {
      if (!job.signal.aborted && ctrl.signal.aborted) throw new Error("Another course was opened, so the recording stopped.");
      throw err;
    } finally {
      off();
    }
  }, { kind: "video", cancellable: true });
};
