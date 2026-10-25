// Taking someone to a setting: its step and tab, the panel it's in opened (and the thing it
// belongs to picked), then the control scrolled into view and lit up for a moment. On a phone or a
// tablet the same places are found where those layouts have them (the sheet brought up, the Map
// step's page tool opened).
import type { Where } from "../lib/guide";
import { getDoc, useEditor } from "../state/course";
import { select } from "../state/actions";
import { getView } from "../state/view";
import { toast } from "../state/toast";
import { SERVER, useAuth } from "../auth/api";
import type { CourseItem } from "../types";
import { openLookPart } from "./MapLookPanel";
import { showLocked } from "./DemoNote";
import { currentLayout } from "./useLayout";

/** Panels that open when asked (the View panel, the course popover, a phone's sheet and page
 * tools): they listen for this. */
export const SHOW_EVENT = "dg-show";
export const askOpen = (what: string) => window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: what }));

const PICK: Record<NonNullable<Where["pick"]>, { find: (i: CourseItem) => boolean; name: string; tool?: string }> = {
  hole: { find: () => false, name: "a hole", tool: "add-hole" },
  // (a tee or basket comes with a hole: the Hole tool is the one turned on)
  tee: { find: i => i.type === "tee", name: "a hole", tool: "add-hole" },
  basket: { find: i => i.type === "basket", name: "a hole", tool: "add-hole" },
  woods: { find: i => i.type === "area" && i.kind === "woods", name: "a woods area", tool: "draw-area" },
  water: { find: i => i.type === "area" && i.kind === "water", name: "water", tool: "draw-area" },
  line: { find: i => i.type === "line", name: "a line", tool: "draw-line" },
  tree: { find: i => i.type === "tree", name: "a tree", tool: "add-tree" },
  structure: { find: i => i.type === "structure", name: "a structure", tool: "draw-structure" },
  walk: { find: i => i.type === "line" && i.kind === "walk", name: "a walk" }
};

/** A computer's controls that a phone or a tablet has somewhere else: where. */
const COMPACT_FIND: Record<string, string> = { "holes-column": "holes-panel", "course-more": "holes-panel", "problems-panel": "checks-sheet", "side-panel": "step-panel" };
/** A phone's Map step tools (each opens its part of the panel), by the part's test id. */
const PAGE_TOOLS = ["card-style", "markings", "map-style", "drawn-on-map", "fold-title", "fold-paper", "print-add", "print-layers", "print-sponsors", "sign-settings", "page-settings", "card-settings"];

const frame = () => new Promise(r => requestAnimationFrame(() => r(null)));

/** A Where's test ids: one, or several to try in turn ("a|b|c"). */
const findsOf = (w: Where) => (w.find ?? "").split("|").filter(Boolean);

/** The control: by its test id (the first of them on screen, else the first there at all), then
 * (within it) the row with those words. */
const locate = (w: Where): HTMLElement | null => {
  const there = findsOf(w).map(id => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)).filter((el): el is HTMLElement => !!el);
  const box = there.find(el => el.getBoundingClientRect().height > 0) ?? there[0] ?? null;
  if (!box || !w.text) return box;
  const t = w.text.toLowerCase();
  const hit = [...box.querySelectorAll<HTMLElement>("label, button, summary, h3, div, span")].find(el => el.childElementCount < 4 && (el.textContent ?? "").trim().toLowerCase().startsWith(t));
  // (its row: the control and its label together)
  return (hit?.closest<HTMLElement>("label, [role=radiogroup], .mb-3, div") ?? hit) || box;
};

/** Lights a control up for a moment, scrolled into the middle of its panel. In a phone's sheet
 * resting low, the sheet comes up to half height first; returns how long that waits (ms). */
export const spotlight = (el: HTMLElement) => {
  // (inside a fold: opened)
  for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
  const sheet = el.closest<HTMLElement>('[data-testid="sheet"]');
  const low = !!sheet && sheet.dataset.detent === "peek" && !!el.closest('[data-testid="sheet-body"]');
  if (low) askOpen("sheet:half");
  const light = () => {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("dg-found");
    void el.offsetWidth;
    el.classList.add("dg-found");
    window.setTimeout(() => el.classList.remove("dg-found"), 2400);
  };
  const wait = low ? 360 : 0;
  if (wait) window.setTimeout(light, wait);
  else light();
  return wait;
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

export async function showSetting(where: Where) {
  const ed = useEditor.getState();
  const layout = currentLayout();
  // (a phone's or a tablet's own place for a computer's control)
  const w: Where = layout !== "desktop" && where.find ? { ...where, find: findsOf(where).map(f => COMPACT_FIND[f] ?? f).join("|") } : where;
  if (w.step) ed.set({ step: w.step, teeView: null, flyover: false, tool: "select" });
  // (a tool's own controls: only there while it's on)
  if (w.tool) ed.set({ tool: w.tool });
  if (w.tab) ed.set({ designTab: w.tab });
  // (open now if the panel is up, or when it comes)
  if (w.look) { openLookPart(w.look); askOpen(`look:${w.look}`); }
  if (w.pick) {
    const doc = getDoc();
    const p = PICK[w.pick];
    const id = w.pick === "hole" ? (doc.holes.find(h => h.id === ed.selectedId) ?? doc.holes[0])?.id : doc.items.find(p.find)?.id;
    if (!id) {
      toast(`Add ${p.name} first.${p.tool ? " Its tool is on." : ""}`, "info");
      if (p.tool) ed.set({ tool: p.tool as never });
      return;
    }
    select(id);
    requestAnimationFrame(() => (w.pick === "hole" ? getView()?.fitHole(id) : getView()?.reveal(id)));
  }
  if (w.open === "problems") ed.set({ problemsOpen: true });
  else if (w.open === "share-public" || w.open === "share-people") {
    if (!SERVER) { showLocked("share"); return; }
    useAuth.getState().share(w.open === "share-public" ? "public" : "people");
  } else if (w.open) askOpen(w.open);
  if (!w.find) { if (w.say) toast(w.say, "info", false, undefined, 9000); return; }
  // (the Map step on a phone, and the course map's tab on a computer: the page's settings are a row of tools, each opening its part of them)
  const finds = findsOf(w);
  const pageTool = (layout === "phone" || (w.tab ?? ed.designTab) === "map") && (w.step ?? ed.step) === "map" ? (finds.find(f => PAGE_TOOLS.includes(f)) ?? (w.look || finds.some(f => f.startsWith("look-part-")) ? "map-style" : null)) : null;
  // (the panel drawn, maybe after its code loads)
  for (let k = 0; k < 90; k++) {
    await frame();
    // (once the step's tools are up)
    if (k === 1 && pageTool) askOpen(`page-tool:${pageTool}`);
    const el = locate(w);
    if (el && el.getBoundingClientRect().height > 0) {
      if (w.look) await frame();
      const at = locate(w) ?? el;
      const wait = spotlight(at);
      if (w.say) window.setTimeout(() => coach(at, w.say!), 350 + wait);
      return;
    }
  }
  // (not on screen: what it would have said, all the same, or where it is)
  if (w.say) toast(w.say, "info", false, undefined, 9000);
  else if (w.missing) toast(`Couldn't point at it from here. It's under ${w.missing}.`, "info");
}
