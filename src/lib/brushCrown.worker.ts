// Hand painted trees painted away from the page, a batch at a time, each on its own canvas,
// handed back as pictures for the page to lay on the map in order (lib/brushCrown).
import { paintTree, type BrushTree } from "./brushCrown";

self.onmessage = (e: MessageEvent<{ id: number; trees: BrushTree[]; sun: number[] }>) => {
  const { id, trees, sun } = e.data;
  try {
    const out = trees.map(t => {
      const c = new OffscreenCanvas(Math.ceil(t.r * 3.4) + 24, Math.ceil(t.r * 3.4) + 24);
      const S = paintTree(c, t, sun);
      return { S, bm: c.transferToImageBitmap() };
    });
    (self as unknown as Worker).postMessage({ id, out }, out.map(o => o.bm));
  } catch {
    (self as unknown as Worker).postMessage({ id, out: null });
  }
};
