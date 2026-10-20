// Recording flyovers to a video file. The map view draws each moment of a flight offscreen (see
// CourseView.flightFrames); here the frames get the hole's title and the basket marker and go to
// an encoder, frame by frame at a steady 1/fps step, so a slow computer makes the same smooth video
// as a fast one, only later. WebCodecs encodes H.264 into an MP4 where the browser can (VP9 or
// VP8 into a WebM where it can't); without WebCodecs the flight plays in real time into a
// MediaRecorder.
import { Muxer as Mp4Muxer, StreamTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, StreamTarget as WebmTarget } from "webm-muxer";
import { avcCodec, videoBitrate, videoTimeline, vp9Codec } from "../lib/video";
import { drawOverlay, holeTitle, type FrameInfo } from "./flyTitle";
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

export type { FrameInfo };

/** Flights drawn offscreen at a fixed size (CourseView.flightFrames). */
export interface FlightFrames {
  /** Seconds the flight over the hole lasts (0: the hole can't be flown: no tee or basket). */
  duration(holeId: string): number;
  /** Draws the hole's flight at `t` seconds into `out` (RGBA, top row first, opaque). */
  draw(holeId: string, t: number, out: Uint8ClampedArray): FrameInfo;
  /** Gets the ground ready for a hole before its frames (its sharp painting). */
  prepare?(holeId: string): Promise<void>;
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

/** Where encoded frames go. `behind` (real-time recorders only): frame i is already late, skip it.
 * `pause`/`resume` (real-time recorders only): the time between is left out of the video. */
type Sink = {
  codec: string;
  add(canvas: HTMLCanvasElement, index: number, keyFrame: boolean): Promise<void>;
  behind?(index: number): boolean;
  pause?(): Promise<void>;
  resume?(): void;
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
  let pausedAt = 0;
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
    async pause() {
      if (!start || pausedAt) return;
      // The last frame shows for its full time first
      const wait = due(last + 1) - performance.now();
      if (wait > 0) await sleep(wait);
      if (recorder.state === "recording") recorder.pause();
      pausedAt = performance.now();
    },
    resume() {
      if (!pausedAt) return;
      start += performance.now() - pausedAt;
      pausedAt = 0;
      if (recorder.state === "paused") recorder.resume();
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

/** Records the flights over the holes, one after another, to a video file. */
export async function recordFlights(src: FlightFrames, doc: CourseDoc, holeIds: string[], opts: RecordOptions): Promise<FlyoverVideo> {
  const { width, height, fps } = opts;
  let sink: Sink | null = null;
  try {
    const holes = holeIds.map(id => ({ id, dur: src.duration(id) })).filter(x => x.dur > 0);
    if (!holes.length) throw new Error("Nothing to fly over yet.");
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
    if (!sink) throw new Error("This browser can't make videos.");
    let info: FrameInfo | null = null;
    let breath = performance.now();
    let ready = -1;
    for (let i = 0; i < plan.length; i++) {
      if (opts.signal?.aborted) throw abortError();
      const f = plan[i];
      if (f.hole !== ready) {
        await sink.pause?.();
        await src.prepare?.(holes[f.hole].id);
        sink.resume?.();
        ready = f.hole;
        if (opts.signal?.aborted) throw abortError();
      }
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
