// Contours and hill shading for the printed map, worked out once per terrain.
import { useEffect, useMemo, useState } from "react";
import { canopyFor, type CanopyGrid } from "../lib/forest";
import { contoursOf, hillshadeCanvas, type Contours } from "../lib/relief";
import { terrainStats } from "../lib/terrainGrid";
import type { CourseDoc } from "../types";

const cache = new WeakMap<Record<string, number>, { contours: Contours; hillshade: string | null }>();

/** Contours and a hill shading picture for a course's terrain (cached per terrain). */
export const reliefOf = (doc: CourseDoc) => {
  const hit = cache.get(doc.terrainHeights);
  if (hit) return hit;
  const t = terrainStats(doc.terrainHeights);
  const value = {
    contours: contoursOf(doc.terrainHeights, doc.gridSize, doc.canvas.width, doc.canvas.height),
    hillshade: t.relief > 1 && typeof document !== "undefined" ? hillshadeCanvas(doc.terrainHeights, doc.gridSize, doc.canvas.width, doc.canvas.height).toDataURL("image/png") : null
  };
  cache.set(doc.terrainHeights, value);
  return value;
};

export const useRelief = (doc: CourseDoc) => useMemo(() => reliefOf(doc), [doc.terrainHeights, doc.gridSize, doc.canvas]); // eslint-disable-line react-hooks/exhaustive-deps

/** Where the photo shows trees (Forest style), once it has been worked out. */
export const useCanopy = (doc: CourseDoc) => {
  const [canopy, setCanopy] = useState<CanopyGrid | null>(null);
  const want = doc.style.theme === "forest" && doc.style.forest === "photo" ? doc.background : null;
  useEffect(() => {
    let live = true;
    if (!want) { setCanopy(null); return; }
    void canopyFor(doc).then(c => { if (live) setCanopy(c); });
    return () => { live = false; };
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  return canopy;
};
