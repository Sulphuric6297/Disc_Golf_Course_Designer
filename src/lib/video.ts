// Flyover videos, the parts that are plain logic: the sizes on offer, which codec (and level) fits
// a size and frame rate, the bitrate, the file name, and the frames of a recording.
import type { CourseDoc } from "../types";
import { holeNumber } from "./course";

export type VideoResolution = "720p" | "1080p" | "1440p" | "4k";
export const VIDEO_SIZES: Record<VideoResolution, { label: string; width: number; height: number }> = {
  "720p": { label: "720p · 1280×720", width: 1280, height: 720 },
  "1080p": { label: "1080p · 1920×1080", width: 1920, height: 1080 },
  "1440p": { label: "1440p · 2560×1440", width: 2560, height: 1440 },
  "4k": { label: "4K · 3840×2160", width: 3840, height: 2160 }
};
export const VIDEO_FPS = [30, 60] as const;
export type VideoFps = (typeof VIDEO_FPS)[number];

/** H.264 levels: the largest picture (16 × 16 macroblocks) and macroblocks per second each allows. */
const AVC_LEVELS: [number, number, number][] = [
  [0x1e, 1620, 40500], [0x1f, 3600, 108000], [0x20, 5120, 216000], [0x28, 8192, 245760], [0x2a, 8704, 522240],
  [0x32, 22080, 589824], [0x33, 36864, 983040], [0x34, 36864, 2073600], [0x3c, 139264, 4177920]
];
const AVC_PROFILES = { high: "6400", main: "4d40", baseline: "42e0" } as const;

/** The H.264 codec string ("avc1.640028" is High at level 4.0) with the lowest level that fits. */
export const avcCodec = (width: number, height: number, fps: number, profile: keyof typeof AVC_PROFILES = "high") => {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level = AVC_LEVELS.find(([, frame, rate]) => mbs <= frame && mbs * fps <= rate)?.[0] ?? 0x3c;
  return `avc1.${AVC_PROFILES[profile]}${level.toString(16).padStart(2, "0")}`;
};

/** VP9 levels: the largest picture (samples) and samples per second each allows. */
const VP9_LEVELS: [number, number, number][] = [
  [10, 36864, 829440], [11, 73728, 2764800], [20, 122880, 4608000], [21, 245760, 9216000], [30, 552960, 20736000],
  [31, 983040, 36864000], [40, 2228224, 83558400], [41, 2228224, 160432128], [50, 8912896, 311951360],
  [51, 8912896, 588251136], [52, 8912896, 1176502272], [60, 35651584, 1176502272]
];

/** The VP9 codec string (profile 0, 8 bit) with the lowest level that fits. */
export const vp9Codec = (width: number, height: number, fps: number) => {
  const samples = width * height;
  const level = VP9_LEVELS.find(([, pic, rate]) => samples <= pic && samples * fps <= rate)?.[0] ?? 62;
  return `vp09.00.${level}.08`;
};

/** Bits per second for a sharp picture of a flight over trees: about 0.13 bits per pixel at 30 fps
 * (8 Mbit/s at 1080p), a little less per frame at 60 fps. */
export const videoBitrate = (width: number, height: number, fps: number) =>
  Math.round(Math.min(60e6, Math.max(1e6, width * height * 30 * 0.13 * (fps > 30 ? 1.5 : 1) * (width * height > 4e6 ? 0.8 : 1))));

/** What goes after the course's name in the file name: "-hole-3-flyover" or "-course-flyover". */
export const videoSuffix = (doc: Pick<CourseDoc, "holes">, holeIds: string[]) =>
  holeIds.length === 1 ? `-hole-${holeNumber(doc, holeIds[0])}-flyover` : "-course-flyover";

/** One frame of a recording: which hole (index in the recording), the moment of its flight (s),
 * whether the 3D picture must be drawn again (held frames repeat the last one), how strongly the
 * hole's big title shows (0..1), and whether a new hole starts (a cut). */
export type TimelineFrame = { hole: number; t: number; render: boolean; title: number; cut: boolean };

/** Seconds the title is held before each flight, and the basket after it. */
export const VIDEO_HOLD = { intro: 0.8, outro: 0.6 };

/** How strongly the hole's big title shows at a moment of its flight (s; before it starts: 1):
 * it fades out over the first second. */
export const titleStrength = (t: number) => Math.max(0, Math.min(1, 1 - (t - 0.3) / 0.7));

/** The frames of a recording of flights lasting `durations` seconds, at a steady 1/fps step: for
 * each hole a moment on the first picture with its title, the flight, and a moment at the basket. */
export const videoTimeline = (durations: number[], fps: number, hold = VIDEO_HOLD): TimelineFrame[] => {
  const frames: TimelineFrame[] = [];
  const intro = Math.round(hold.intro * fps), outro = Math.round(hold.outro * fps);
  durations.forEach((dur, hole) => {
    for (let i = 0; i < intro; i++) frames.push({ hole, t: 0, render: i === 0, title: 1, cut: i === 0 });
    const n = Math.max(1, Math.ceil(dur * fps));
    for (let i = 1; i <= n; i++) {
      const t = Math.min(dur, i / fps);
      // The title fades out over the first second of the flight
      frames.push({ hole, t, render: true, title: titleStrength(t), cut: intro === 0 && i === 1 });
    }
    for (let i = 0; i < outro; i++) frames.push({ hole, t: dur, render: false, title: 0, cut: false });
  });
  return frames;
};
