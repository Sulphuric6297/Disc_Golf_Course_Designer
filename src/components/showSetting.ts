// Taking someone to a setting: its step and tab, the panel it's in opened (and the thing it
// belongs to picked), then the control scrolled into view and lit up for a moment.
import type { Where } from "../lib/guide";
import { getDoc, useEditor } from "../state/course";
import { select } from "../state/actions";
import { getView } from "../state/view";
import { toast } from "../state/toast";
import { SERVER, useAuth } from "../auth/api";
import type { CourseItem } from "../types";
import { openLookPart } from "./MapLookPanel";

/** Panels that open when asked (the View panel, the course popover): they listen for this. */
export const SHOW_EVENT = "dg-show";
export const askOpen = (what: string) => window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: what }));

const PICK: Record<NonNullable<Where["pick"]>, { find: (i: CourseItem) => boolean; name: string; tool?: string }> = {
  hole: { find: () => false, name: "a hole", tool: "add-hole" },
  tee: { find: i => i.type === "tee", name: "a tee", tool: "add-hole" },
  basket: { find: i => i.type === "basket", name: "a basket", tool: "add-hole" },
  woods: { find: i => i.type === "area" && i.kind === "woods", name: "a woods area", tool: "draw-area" },
  water: { find: i => i.type === "area" && i.kind === "water", name: "water", tool: "draw-area" },
  line: { find: i => i.type === "line", name: "a line", tool: "draw-line" },
  tree: { find: i => i.type === "tree", name: "a tree", tool: "add-tree" },
  structure: { find: i => i.type === "structure", name: "a structure", tool: "draw-structure" },
  walk: { find: i => i.type === "line" && i.kind === "walk", name: "a walk" }
};

const frame = () => new Promise(r => requestAnimationFrame(() => r(null)));

/** The control: by its test id, then (within it) the row with those words. */
const locate = (w: Where): HTMLElement | null => {
  const box = w.find ? document.querySelector<HTMLElement>(`[data-testid="${w.find}"]`) : null;
  if (!box || !w.text) return box;
  const t = w.text.toLowerCase();
  const hit = [...box.querySelectorAll<HTMLElement>("label, button, summary, h3, div, span")].find(el => el.childElementCount < 4 && (el.textContent ?? "").trim().toLowerCase().startsWith(t));
  // (its row: the control and its label together)
  return (hit?.closest<HTMLElement>("label, [role=radiogroup], .mb-3, div") ?? hit) || box;
};

/** Lights a control up for a moment, scrolled into the middle of its panel. */
export const spotlight = (el: HTMLElement) => {
  // (inside a fold: opened)
  for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("dg-found");
  void el.offsetWidth;
  el.classList.add("dg-found");
  window.setTimeout(() => el.classList.remove("dg-found"), 2400);
};

/** A short note pointing at a control (below it, or above when there's no room), gone on the next
 * touch or after a while. */
export const coach = (el: HTMLElement, text: string) => {
  document.querySelectorAll(".dg-coach").forEach(n => n.remove());
  const r = el.getBoundingClientRect();
  const tip = document.createElement("div");
  tip.className = "dg-coach";
  tip.setAttribute("role", "status");
  tip.setAttribute("data-testid", "coach");
  tip.textContent = text;
  document.body.appendChild(tip);
  const w = Math.min(280, window.innerWidth - 16), h = tip.offsetHeight;
  const below = r.bottom + 10 + h < window.innerHeight;
  tip.style.width = `${w}px`;
  tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
  tip.style.top = `${below ? r.bottom + 10 : Math.max(8, r.top - 10 - tip.offsetHeight)}px`;
  tip.dataset.side = below ? "below" : "above";
  const gone = () => { tip.remove(); window.removeEventListener("pointerdown", gone, true); };
  window.setTimeout(() => window.addEventListener("pointerdown", gone, true), 300);
  window.setTimeout(gone, 12_000);
};

export async function showSetting(w: Where) {
  const ed = useEditor.getState();
  if (w.step) ed.set({ step: w.step, teeView: null, flyover: false, tool: "select" });
  if (w.tab) ed.set({ designTab: w.tab });
  // (open now if the panel is up, or when it comes)
  if (w.look) { openLookPart(w.look); askOpen(`look:${w.look}`); }
  if (w.pick) {
    const doc = getDoc();
    const p = PICK[w.pick];
    const id = w.pick === "hole" ? (doc.holes.find(h => h.id === ed.selectedId) ?? doc.holes[0])?.id : doc.items.find(p.find)?.id;
    if (!id) {
      toast(`Add ${p.name} first${p.tool ? ": the tool is on" : ""}. Its settings are in its panel once it's picked.`, "info");
      if (p.tool) ed.set({ tool: p.tool as never });
      return;
    }
    select(id);
    requestAnimationFrame(() => (w.pick === "hole" ? getView()?.fitHole(id) : getView()?.reveal(id)));
  }
  if (w.open === "problems") ed.set({ problemsOpen: true });
  else if (w.open === "share-public" || w.open === "share-people") {
    if (!SERVER) { toast("Sharing is on a HyzerLab server, with an account.", "info"); return; }
    useAuth.getState().share(w.open === "share-public" ? "public" : "people");
  } else if (w.open) askOpen(w.open);
  if (!w.find) { if (w.say) toast(w.say, "info", false, undefined, 9000); return; }
  // (the panel drawn, maybe after its code loads)
  for (let k = 0; k < 90; k++) {
    await frame();
    const el = locate(w);
    if (el && el.getBoundingClientRect().height > 0) {
      if (w.look) await frame();
      const at = locate(w) ?? el;
      spotlight(at);
      if (w.say) window.setTimeout(() => coach(at, w.say!), 350);
      return;
    }
  }
}
