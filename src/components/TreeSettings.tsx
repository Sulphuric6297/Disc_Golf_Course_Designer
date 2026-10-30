// A tree's own settings in its panel: what it is (kind, species, its shape) and how big, then,
// folded away, how it's built (where the branches start, limbs, trunk, leaves) and how it leans.
// Any tree on the course gets these, the woods' and the survey's too (picked, they're made the
// course's own).
import { useMemo } from "react";
import { RotateCcw, Shrub, Shuffle, TreeDeciduous, TreePine } from "lucide-react";
import { COMPASS } from "../constants";
import { presetDefaults, presetFor, SPECIES, specOf, speciesOfPreset } from "../three/ezShapes";
import { variantOf, type TreeShape } from "../three/treeKit";
import { fmtDist } from "../lib/units";
import { useCourse } from "../state/course";
import type { TreeItem, TreeKind } from "../types";
import { Button, ChipPick, Field, Slider } from "./ui";

const shapeOf = (k: TreeKind | undefined): TreeShape => (k === "conifer" ? "conifer" : k === "bush" ? "bush" : "broadleaf");
/** The kinds of tree, as the tool bar names them (its icons too): a tree's panel and a phone's strip. */
export const TREE_KINDS: { value: TreeKind; label: string; icon: JSX.Element }[] = [
  { value: "deciduous", label: "Leafy tree", icon: <TreeDeciduous size={14} /> },
  { value: "conifer", label: "Conifer", icon: <TreePine size={14} /> },
  { value: "bush", label: "Bush", icon: <Shrub size={14} /> }
];
/** The settings that make a tree its own shape (cleared by Reset, which keeps its species). */
const OWN = { seed: undefined, crownBase: undefined, lean: undefined, leanDir: undefined, limbs: undefined, trunk: undefined, fullness: undefined };

/** A tree's kind of shape and its species now (its own, or its variant's). */
export const speciesNow = (item: TreeItem) => {
  const shape = shapeOf(item.treeType ?? "deciduous");
  const pool = specOf(shape, item.variant ?? variantOf(item.id, shape));
  return { shape, species: item.species ?? speciesOfPreset(shape, pool.preset) };
};

export function TreeSettings({ item, set }: { item: TreeItem; set: (patch: Partial<TreeItem>, history?: boolean) => void }) {
  const u = useCourse(s => s.doc.units);
  const done = () => useCourse.getState().commit();
  const kind = item.treeType ?? "deciduous";
  const shape = shapeOf(kind);
  const height = item.height ?? item.radius * 2.6;
  // What it is now: its species, and the preset that species takes at its height
  const pool = specOf(shape, item.variant ?? variantOf(item.id, shape));
  const species = item.species ?? speciesOfPreset(shape, pool.preset);
  const preset = item.species !== undefined && item.species !== speciesOfPreset(shape, pool.preset) ? presetFor(shape, species, height) : pool.preset;
  const base = useMemo(() => presetDefaults(preset), [preset]);
  const own = item.seed !== undefined || item.crownBase !== undefined || item.lean || item.limbs !== undefined || item.trunk !== undefined || item.fullness !== undefined;
  const limbMax = shape === "conifer" ? 140 : 14, limbMin = shape === "conifer" ? 20 : 1;
  return (
    <div data-testid="tree-settings">
      <Field label="Kind" help="trees">
        <ChipPick label="Tree kind" value={kind} onChange={v => set({ treeType: v, species: undefined, variant: undefined, leaf: undefined })} options={TREE_KINDS} />
      </Field>
      <Field label="Species">
        <ChipPick label="Species" testid="tree-species" value={species} onChange={v => set({ species: v, leaf: undefined })} options={SPECIES[shape].map(s => ({ value: s.id, label: s.label }))} />
      </Field>
      <div className="mb-3">
        <Button small onClick={() => set({ seed: Math.floor(Math.random() * 1e6), species, variant: undefined })} title="Grow a different tree of this species" testid="tree-new-shape"><Shuffle size={13} /> New shape</Button>
      </div>
      {/* (taller or shorter keeps its shape: the crown grows or shrinks with it; one bigger than the
          sliders go, from the survey, keeps its size until it's changed) */}
      <Slider label="Height" min={2} max={Math.max(120, Math.round(height))} value={Math.round(height)} onChange={v => set({ height: v, radius: Math.max(1, Math.min(45, Math.round(item.radius * (v / height) * 10) / 10)) }, false)} onDone={done} format={v => fmtDist(v, u)} />
      <Slider label="Spread" min={2} max={Math.max(90, Math.round(item.radius * 2))} value={Math.round(item.radius * 2)} onChange={v => set({ radius: v / 2 }, false)} onDone={done} format={v => fmtDist(v, u)} />
      <details className="mb-2 group" data-testid="tree-shape-details">
        <summary className="cursor-pointer list-none flex items-center justify-between py-1.5 text-xs font-semibold text-zinc-300 hover:text-zinc-50">Shape details <span className="text-zinc-500 group-open:rotate-90 transition-transform">›</span></summary>
        <div className="pt-1.5">
          <Slider label="Branches start" min={0} max={90} step={1} value={Math.round((item.crownBase ?? base.crownBase) * 100)} onChange={v => set({ crownBase: v / 100 }, false)} onDone={done} format={v => `${v}% up the trunk`} />
          <Slider label={shape === "conifer" ? "How many branches" : "How many limbs"} min={limbMin} max={limbMax} step={1} value={Math.round(item.limbs ?? base.limbs)} onChange={v => set({ limbs: v }, false)} onDone={done} format={v => String(v)} />
          <Slider label="Trunk" min={40} max={250} step={5} value={Math.round((item.trunk ?? 1) * 100)} onChange={v => set({ trunk: v / 100 }, false)} onDone={done} format={v => (v === 100 ? "As grown" : v < 100 ? `Thinner (${v}%)` : `Thicker (${v}%)`)} />
          <Slider label="Leaves" min={25} max={180} step={5} value={Math.round((item.fullness ?? 1) * 100)} onChange={v => set({ fullness: v / 100 }, false)} onDone={done} format={v => (v === 100 ? "As grown" : v < 100 ? `Sparser (${v}%)` : `Fuller (${v}%)`)} />
          <Slider label="Lean" min={0} max={30} step={1} value={Math.round(item.lean ?? 0)} onChange={v => set({ lean: v || undefined }, false)} onDone={done} format={v => (v ? `${v}°` : "Upright")} />
          {(item.lean ?? 0) > 0 && (
            <Slider label="Leaning toward" min={0} max={345} step={15} value={Math.round(item.leanDir ?? 0)} onChange={v => set({ leanDir: v }, false)} onDone={done} format={v => `${COMPASS[Math.round(v / 45) % 8]} (${v}°)`} />
          )}
        </div>
      </details>
      {own && (
        <div className="mb-2">
          <Button small tone="ghost" onClick={() => set(OWN)} title="Its species' own shape and settings again (it stays this species)" testid="tree-natural"><RotateCcw size={13} /> Reset</Button>
        </div>
      )}
    </div>
  );
}
