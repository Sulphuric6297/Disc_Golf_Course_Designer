// Finding woods, trees and water on a photo away from the page, so it keeps moving meanwhile
// (the work takes seconds on a big site).
import { findNature } from "./natureFind";

self.onmessage = (e: MessageEvent<{ data: Uint8ClampedArray; width: number; height: number; nir?: Uint8Array; mpp: number; opts: { date?: string; lat?: number; waterOnly?: boolean; season?: string; canopy?: boolean } }>) => {
  const { data, width, height, nir, mpp, opts } = e.data;
  try {
    const found = findNature({ pixels: { data, width, height }, nir, mpp }, opts);
    (self as unknown as Worker).postMessage({ found }, found.mask ? [found.mask.buffer] : []);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: String(err) });
  }
};
