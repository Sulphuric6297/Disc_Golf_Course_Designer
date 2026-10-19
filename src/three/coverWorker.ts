// Works out a photo's ground cover mask off the main thread (see lib/geo/landCover).
import { classifyCover } from "../lib/geo/landCover";

type Job = { id: number; data: Uint8ClampedArray; width: number; height: number; pxPerFt: number };

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, data, width, height, pxPerFt } = e.data;
  const mask = classifyCover({ data, width, height }, { pxPerFt });
  (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage({ id, data: mask.data, width, height }, [mask.data.buffer]);
};
