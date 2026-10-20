// Recording flyovers to a video file. The map view draws each moment of a flight offscreen (see
// CourseView.flightFrames); here the frames get the hole's title and the basket marker and go to
// an encoder, frame by frame at a steady 1/fps step, so a slow computer makes the same smooth video
// as a fast one, only later. WebCodecs encodes H.264 into an MP4 where the browser can (VP9 or
// VP8 into a WebM where it can't); without WebCodecs the flight plays in real time into a
// MediaRecorder.
import { Muxer as Mp4Muxer, StreamTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, StreamTarget as WebmTarget } from "webm-muxer";
import { TEE_LEVELS } from "../constants";
import { holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev } from "../lib/units";
import { avcCodec, videoBitrate, videoTimeline, vp9Codec } from "../lib/video";
import type { CourseDoc } from "../types";

export type RecordOptions = {
  width: number;
  height: number;
  fps: number;
  /** 0..1 as the frames are made. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type FlyoverVideo = { blob: Blob; mime: string; ext: "mp4" | "webm"; codec: string; frames: number; seconds: number };

/** Where the basket is in a frame (pixels, or null when out of the picture) and how far it is (ft). */
export type FrameInfo = { basket: { x: number; y: number } | null; toBasket: number };

/** Flights drawn offscreen at a fixed size (CourseView.flightFrames). */
export interface FlightFrames {
  /** Seconds the flight over the hole lasts (0: the hole can't be flown: no tee or basket). */
  duration(holeId: string): number;
  /** Draws the hole's flight at `t` seconds into `out` (RGBA, top row first, opaque). */
  draw(holeId: string, t: number, out: Uint8ClampedArray): FrameInfo;
  dispose(): void;
}

const abortError = () => new DOMException("The recording was cancelled.", "AbortError");

/** Lets the page breathe between frames (a message, not a timer: timers slow to a crawl in a
 * background tab). */
const breathe = () => new Promise<void>(resolve => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => resolve();
  ch.port2.postMessage(0);
});
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** The file, collected in pieces as the muxer writes it (headers patched at the end are written
 * over the bytes already there), so a long video never needs one huge growing buffer. */
class FileParts {
  private parts: Uint8Array[] = [];
  private starts: number[] = [];
  private end = 0;
  write(data: Uint8Array, pos: number) {
    if (pos > this.end) this.append(new Uint8Array(pos - this.end));
    if (pos === this.end) {
      this.append(data.slice());
      return;
    }
    for (let i = 0; i < this.parts.length; i++) {
      const s = this.starts[i], p = this.parts[i];
      const from = Math.max(pos, s), to = Math.min(pos + data.length, s + p.length);
      if (from < to) p.set(data.subarray(from - pos, to - pos), from - s);
    }
    if (pos + data.length > this.end) this.append(data.slice(this.end - pos));
  }
  private append(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.starts.push(this.end);
    this.end += bytes.length;
  }
  blob(type: string) {
    return new Blob(this.parts as BlobPart[], { type });
  }
}

/** Where encoded frames go. `behind` (real-time recorders only): frame i is already late, skip it. */
type Sink = {
  codec: string;
  add(canvas: HTMLCanvasElement, index: number, keyFrame: boolean): Promise<void>;
  behind?(index: number): boolean;
  finish(): Promise<{ blob: Blob; mime: string; ext: "mp4" | "webm" }>;
  close(): void;
};

/** WebCodecs: H.264 in an MP4 if the browser has an encoder for it, else VP9 or VP8 in a WebM. */
async function webCodecsSink(width: number, height: number, fps: number): Promise<Sink | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  const bitrate = videoBitrate(width, height, fps);
  const tries: { codec: string; mp4: boolean }[] = [
    { codec: avcCodec(width, height, fps, "high"), mp4: true },
    { codec: avcCodec(width, height, fps, "main"), mp4: true },
    { codec: avcCodec(width, height, fps, "baseline"), mp4: true },
    { codec: vp9Codec(width, height, fps), mp4: false },
    { codec: "vp8", mp4: false }
  ];
  for (const t of tries) {
    const config: VideoEncoderConfig = { codec: t.codec, width, height, bitrate, framerate: fps, latencyMode: "quality", ...(t.mp4 ? { avc: { format: "avc" as const } } : {}) };
    let supported = false;
    try {
      supported = !!(await VideoEncoder.isConfigSupported(config)).supported;
    } catch {
      supported = false;
    }
    if (!supported) continue;
    const file = new FileParts();
    const onData = (data: Uint8Array, position: number) => file.write(data, position);
    const muxer = t.mp4
      ? new Mp4Muxer({ target: new Mp4Target({ onData }), video: { codec: "avc", width, height, frameRate: fps }, fastStart: false })
      : new WebmMuxer({ target: new WebmTarget({ onData }), video: { codec: t.codec === "vp8" ? "V_VP8" : "V_VP9", width, height, frameRate: fps } });
    let failure: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { failure = e instanceof Error ? e : new Error(String(e)); }
    });
    encoder.configure(config);
    const frameUs = 1e6 / fps;
    const mime = t.mp4 ? "video/mp4" : "video/webm";
    return {
      codec: t.codec,
      async add(canvas, index, keyFrame) {
        if (failure) throw failure;
        // Don't run ahead of the encoder
        while (encoder.encodeQueueSize > 4) {
          await new Promise<void>(resolve => {
            const done = () => resolve();
            encoder.addEventListener("dequeue", done, { once: true });
            setTimeout(done, 50);
          });
          if (failure) throw failure;
        }
        const frame = new VideoFrame(canvas, { timestamp: Math.round(index * frameUs), duration: Math.round(frameUs) });
        try {
          encoder.encode(frame, { keyFrame });
        } finally {
          frame.close();
        }
      },
      async finish() {
        await encoder.flush();
        if (failure) throw failure;
        encoder.close();
        muxer.finalize();
        return { blob: file.blob(mime), mime, ext: t.mp4 ? "mp4" : "webm" };
      },
      close() {
        try {
          if (encoder.state !== "closed") encoder.close();
        } catch {
          /* already closed */
        }
      }
    };
  }
  return null;
}

/** No WebCodecs: a MediaRecorder on the canvas, fed in real time (frames that come too late are
 * skipped, like a screen recording). */
function recorderSink(canvas: HTMLCanvasElement, width: number, height: number, fps: number): Sink | null {
  if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") return null;
  const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) return null;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: videoBitrate(width, height, fps) });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.start(1000);
  let start = 0;
  let last = -1;
  const due = (i: number) => start + (i * 1000) / fps;
  return {
    codec: mime,
    behind: i => start > 0 && performance.now() > due(i + 1),
    async add(_canvas, index) {
      if (!start) start = performance.now() - (index * 1000) / fps;
      const wait = due(index) - performance.now();
      if (wait > 1) await sleep(wait);
      track.requestFrame();
      last = index;
    },
    async finish() {
      // The last frame shows for its full time
      const wait = due(last + 1) - performance.now();
      if (wait > 0) await sleep(wait);
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      const type = recorder.mimeType || mime;
      return { blob: new Blob(chunks, { type }), mime: type, ext: type.includes("mp4") ? "mp4" : "webm" };
    },
    close() {
      if (recorder.state !== "inactive") recorder.stop();
      stream.getTracks().forEach(t => t.stop());
    }
  };
}

type HoleTitle = { number: number; name: string; par: string; length: string; elevation: string; color: string; ink: string };

const holeTitle = (doc: CourseDoc, holeId: string): HoleTitle => {
  const hole = doc.holes.find(h => h.id === holeId)!;
  const s = holeStats(doc, hole);
  const lvl = TEE_LEVELS[s.level];
  return { number: s.number, name: hole.name ?? "", par: `PAR ${s.par}`, length: fmtDist(s.length, doc.units).toUpperCase(), elevation: Math.abs(s.elevationChange) >= 1 ? fmtElev(s.elevationChange, doc.units).toUpperCase() : "", color: lvl.color, ink: lvl.ink };
};

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

const HEAD = "Oswald, 'Arial Narrow', Arial, sans-serif";
const BODY = "Inter, Arial, sans-serif";

/** Over the picture: the hole's badge in the corner, its big title as the flight starts, the
 * basket marker with the distance left, and the course's name. */
const drawOverlay = (g: CanvasRenderingContext2D, w: number, h: number, hole: HoleTitle, title: number, info: FrameInfo | null, doc: CourseDoc) => {
  const u = h / 720;
  g.save();
  g.textBaseline = "middle";
  // The basket, with the distance still to fly (once the big title has gone)
  if (info?.basket && title < 0.95) {
    g.globalAlpha = 1 - title;
    const label = fmtDist(info.toBasket, doc.units);
    g.font = `700 ${Math.round(17 * u)}px ${BODY}`;
    const tw = g.measureText(label).width;
    const bx = info.basket.x, by = info.basket.y;
    g.shadowColor = "rgba(0,0,0,.5)";
    g.shadowBlur = 6 * u;
    g.fillStyle = doc.style.basket;
    roundRect(g, bx - tw / 2 - 11 * u, by - 52 * u, tw + 22 * u, 28 * u, 14 * u);
    g.fill();
    g.beginPath();
    g.moveTo(bx - 9 * u, by - 18 * u);
    g.lineTo(bx + 9 * u, by - 18 * u);
    g.lineTo(bx, by - 4 * u);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "#111111";
    g.textAlign = "center";
    g.fillText(label, bx, by - 38 * u);
    g.globalAlpha = 1;
  }
  // The hole's badge, top left
  const r = 30 * u, x0 = 28 * u, y0 = 28 * u;
  g.font = `700 ${Math.round(28 * u)}px ${HEAD}`;
  const line1 = `HOLE ${hole.number}`;
  const line2 = `${hole.par} · ${hole.length}`;
  const bw = Math.max(g.measureText(line1).width, (g.font = `600 ${Math.round(18 * u)}px ${HEAD}`, g.measureText(line2).width)) + 2 * r + 46 * u;
  g.fillStyle = "rgba(9,14,9,.72)";
  roundRect(g, x0, y0, bw, 2 * r + 20 * u, r + 10 * u);
  g.fill();
  const cx = x0 + 10 * u + r, cy = y0 + 10 * u + r;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = hole.color;
  g.fill();
  g.lineWidth = 3 * u;
  g.strokeStyle = "#ffffff";
  g.stroke();
  g.fillStyle = hole.ink;
  g.textAlign = "center";
  g.font = `700 ${Math.round(30 * u)}px ${HEAD}`;
  g.fillText(String(hole.number), cx, cy + 1 * u);
  g.textAlign = "left";
  g.fillStyle = "#ffffff";
  g.font = `700 ${Math.round(28 * u)}px ${HEAD}`;
  g.fillText(line1, cx + r + 14 * u, cy - 12 * u);
  g.font = `600 ${Math.round(18 * u)}px ${HEAD}`;
  g.fillStyle = "#d9f99d";
  g.fillText(line2, cx + r + 14 * u, cy + 16 * u);
  // The course, bottom right
  if (doc.name) {
    g.font = `600 ${Math.round(15 * u)}px ${BODY}`;
    g.textAlign = "right";
    g.fillStyle = "rgba(255,255,255,.85)";
    g.shadowColor = "rgba(0,0,0,.7)";
    g.shadowBlur = 4 * u;
    g.fillText(doc.name, w - 24 * u, h - 24 * u);
    g.shadowBlur = 0;
  }
  // The big title as the flight starts
  if (title > 0.01) {
    g.globalAlpha = title;
    const grad = g.createLinearGradient(0, h * 0.25, 0, h * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, "rgba(0,0,0,.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, h * 0.25, w, h * 0.5);
    g.textAlign = "center";
    g.fillStyle = "#ffffff";
    g.shadowColor = "rgba(0,0,0,.6)";
    g.shadowBlur = 10 * u;
    if (doc.name) {
      g.font = `600 ${Math.round(20 * u)}px ${BODY}`;
      g.fillText(doc.name.toUpperCase(), w / 2, h * 0.37);
    }
    g.font = `700 ${Math.round(96 * u)}px ${HEAD}`;
    g.fillText(hole.name ? `${hole.number} · ${hole.name.toUpperCase()}` : `HOLE ${hole.number}`, w / 2, h * 0.49);
    g.font = `600 ${Math.round(34 * u)}px ${HEAD}`;
    g.fillStyle = "#ecfccb";
    g.fillText([hole.par, hole.length, hole.elevation].filter(Boolean).join("  ·  "), w / 2, h * 0.61);
  }
  g.restore();
};

/** Records the flights over the holes, one after another, to a video file. */
export async function recordFlights(src: FlightFrames, doc: CourseDoc, holeIds: string[], opts: RecordOptions): Promise<FlyoverVideo> {
  const { width, height, fps } = opts;
  let sink: Sink | null = null;
  try {
    const holes = holeIds.map(id => ({ id, dur: src.duration(id) })).filter(x => x.dur > 0);
    if (!holes.length) throw new Error("Nothing to fly over yet: a hole needs a tee and a basket.");
    if (width % 2 || height % 2) throw new Error("A video's width and height must be even.");
    const titles = holes.map(x => holeTitle(doc, x.id));
    const plan = videoTimeline(holes.map(x => x.dur), fps);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("No canvas to draw the video on.");
    // The lettering's fonts, if the page can get them (a moment at most)
    if (typeof document.fonts?.load === "function") {
      await Promise.race([Promise.all(["700 30px Oswald", "600 30px Oswald", "600 15px Inter", "700 15px Inter"].map(f => document.fonts.load(f).catch(() => []))), sleep(1500)]);
    }
    const image = g.createImageData(width, height);
    sink = (await webCodecsSink(width, height, fps)) ?? recorderSink(canvas, width, height, fps);
    if (!sink) throw new Error("This browser can't make videos. Try a recent Chrome, Edge, Firefox or Safari.");
    let info: FrameInfo | null = null;
    let breath = performance.now();
    for (let i = 0; i < plan.length; i++) {
      if (opts.signal?.aborted) throw abortError();
      const f = plan[i];
      if (sink.behind?.(i) && !f.cut) continue;
      if (f.render) {
        info = src.draw(holes[f.hole].id, f.t, image.data);
        g.putImageData(image, 0, 0);
        drawOverlay(g, width, height, titles[f.hole], f.title, info, doc);
      }
      await sink.add(canvas, i, f.cut || i % (fps * 2) === 0);
      opts.onProgress?.((i + 1) / plan.length);
      if (performance.now() - breath > 30) {
        await breathe();
        breath = performance.now();
      }
    }
    if (opts.signal?.aborted) throw abortError();
    const out = await sink.finish();
    return { ...out, codec: sink.codec, frames: plan.length, seconds: plan.length / fps };
  } finally {
    sink?.close();
    src.dispose();
  }
}
