// A tree's own settings in its panel: what it is (kind, species, its shape), how big, how it's
// built (where the branches start, limbs, trunk, leaves) and how it leans. Any tree on the course
// gets these, the woods' and the survey's too (picked, they're made the course's own).
import { useMemo } from "react";
import { RotateCcw, Shuffle } from "lucide-react";
import { presetDefaults, presetFor, SPECIES, specOf, speciesOfPreset } from "../three/ezShapes";
import { variantOf, type TreeShape } from "../three/treeKit";
import { fmtDist } from "../lib/units";
import { useCourse } from "../state/course";
import type { TreeItem, TreeKind } from "../types";
import { Button, Field, Segmented, Slider } from "./ui";

const shapeOf = (k: TreeKind | undefined): TreeShape => (k === "conifer" ? "conifer" : k === "bush" ? "bush" : "broadleaf");
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** The settings that make a tree its own (cleared by Back to natural). */
const OWN = { species: undefined, seed: undefined, crownBase: undefined, lean: undefined, leanDir: undefined, limbs: undefined, trunk: undefined, fullness: undefined };

export function TreeSettings({ item, set }: { item: TreeItem; set: (patch: Partial<TreeItem>, history?: boolean) => void }) {
  const u = useCourse(s => s.doc.units);
  const done = () => useCourse.getState().commit();
  const kind = item.treeType ?? "deciduous";
  const shape = shapeOf(kind);
  const height = item.height ?? item.radius * 2.6;
  const palm = kind === "palm";
  // What it is now: its species, and the preset that species takes at its height
  const pool = specOf(shape, item.variant ?? variantOf(item.id, shape));
  const species = item.species ?? speciesOfPreset(shape, pool.preset);
  const preset = item.species !== undefined && item.species !== speciesOfPreset(shape, pool.preset) ? presetFor(shape, species, height) : pool.preset;
  const base = useMemo(() => (palm ? { crownBase: 0.3, limbs: 6 } : presetDefaults(preset)), [palm, preset]);
  const own = item.species !== undefined || item.seed !== undefined || item.crownBase !== undefined || item.lean || item.limbs !== undefined || item.trunk !== undefined || item.fullness !== undefined;
  const limbMax = shape === "conifer" ? 140 : 14, limbMin = shape === "conifer" ? 20 : 1;
  return (
    <div data-testid="tree-settings">
      <Field label="Kind">
        <Segmented label="Tree kind" value={kind} onChange={v => set({ treeType: v as TreeKind, species: undefined, variant: undefined, leaf: undefined })} options={[{ value: "deciduous", label: "Leafy" }, { value: "conifer", label: "Pine" }, { value: "bush", label: "Bush" }, { value: "palm", label: "Palm" }]} />
      </Field>
      {!palm && (
        <div className="flex items-end gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <Field label="Species">
              <Segmented label="Species" value={species} onChange={v => set({ species: v, leaf: undefined })} options={SPECIES[shape].map(s => ({ value: s.id, label: s.label }))} />
            </Field>
          </div>
          <div className="mb-3">
            <Button small onClick={() => set({ seed: Math.floor(Math.random() * 1e6), species, variant: undefined })} title="Grow a different tree of this species" testid="tree-new-shape"><Shuffle size={13} /> New shape</Button>
          </div>
        </div>
      )}
      {/* (taller or shorter keeps its shape: the crown grows or shrinks with it) */}
      <Slider label="Height" min={2} max={120} value={Math.round(height)} onChange={v => set({ height: v, radius: Math.max(1, Math.min(45, Math.round(item.radius * (v / height) * 10) / 10)) }, false)} onDone={done} format={v => fmtDist(v, u)} />
      <Slider label="Spread" min={2} max={90} value={Math.round(item.radius * 2)} onChange={v => set({ radius: v / 2 }, false)} onDone={done} format={v => fmtDist(v, u)} />
      {!palm && (
        <>
          <Slider label="Branches start" min={0} max={90} step={1} value={Math.round((item.crownBase ?? base.crownBase) * 100)} onChange={v => set({ crownBase: v / 100 }, false)} onDone={done} format={v => `${v}% up the trunk`} />
          <Slider label={shape === "conifer" ? "Branches" : "Limbs"} min={limbMin} max={limbMax} step={1} value={Math.round(item.limbs ?? base.limbs)} onChange={v => set({ limbs: v }, false)} onDone={done} format={v => String(v)} />
          <Slider label="Trunk" min={40} max={250} step={5} value={Math.round((item.trunk ?? 1) * 100)} onChange={v => set({ trunk: v / 100 }, false)} onDone={done} format={v => (v === 100 ? "As grown" : v < 100 ? `Thinner (${v}%)` : `Thicker (${v}%)`)} />
          <Slider label="Leaves" min={25} max={180} step={5} value={Math.round((item.fullness ?? 1) * 100)} onChange={v => set({ fullness: v / 100 }, false)} onDone={done} format={v => (v === 100 ? "As grown" : v < 100 ? `Sparser (${v}%)` : `Fuller (${v}%)`)} />
        </>
      )}
      <Slider label="Lean" min={0} max={30} step={1} value={Math.round(item.lean ?? 0)} onChange={v => set({ lean: v || undefined }, false)} onDone={done} format={v => (v ? `${v}°` : "Upright")} />
      {(item.lean ?? 0) > 0 && (
        <Slider label="Leaning toward" min={0} max={345} step={15} value={Math.round(item.leanDir ?? 0)} onChange={v => set({ leanDir: v }, false)} onDone={done} format={v => `${COMPASS[Math.round(v / 45) % 8]} (${v}°)`} />
      )}
      {own && (
        <div className="mb-2">
          <Button small tone="ghost" onClick={() => set(OWN)} title="Its species' own shape and settings again" testid="tree-natural"><RotateCcw size={13} /> Back to natural</Button>
        </div>
      )}
    </div>
  );
}
