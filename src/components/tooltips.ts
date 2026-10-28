// What a button is, said when the mouse rests on it: anything with a title, and icon-only buttons by
// their label. One tip for the whole app, quicker and easier to read than the browser's own (which
// is kept from showing twice: the title moves to data-tip, and to aria-label when it named the
// button). Mouse only: a finger has no hover.

const PICK = "[title],[data-tip],button[aria-label],a[aria-label],[role=button][aria-label],[role=radio][aria-label],[role=tab][aria-label],[role=menuitem][aria-label]";
/** What a tip stays inside: the panel, dialog, menu or bar its button is in, or the map. */
const FRAME = ".glass,.glass-solid,[role=dialog],[role=menu],[role=toolbar],aside,main";
/** Waits before the first tip; once one has shown, the next comes at once. */
const FIRST_MS = 380, WARM_MS = 600;
/** On the map (a point's or a handle's tip): only once the pointer has rested on it this long, and
 * not soon after the map was last pressed or dragged, so a tip never sits over the work. */
const MAP_REST_MS = 1500, MAP_QUIET_MS = 2500;
const onMap = (el: Element) => !!el.closest('[data-testid="plan"]');

const tipOf = (el: Element) => {
  const title = el.getAttribute("title");
  if (title) {
    // (the browser's own tip would show too; the name it gave a button without text kept)
    if (!el.hasAttribute("aria-label") && !(el as HTMLElement).innerText?.trim()) el.setAttribute("aria-label", title);
    el.setAttribute("data-tip", title);
    el.removeAttribute("title");
  }
  const tip = el.getAttribute("data-tip");
  if (tip) return tip;
  // A label is said only where nothing on the button says it already
  const label = el.getAttribute("aria-label");
  return label && !(el as HTMLElement).innerText?.trim() ? label : "";
};

export function installTooltips() {
  if (typeof document === "undefined") return;
  const box = document.createElement("div");
  box.className = "dg-tip";
  box.setAttribute("role", "tooltip");
  box.setAttribute("data-testid", "tooltip");
  document.body.appendChild(box);
  let on: Element | null = null, timer = 0, warmUntil = 0, mapQuietUntil = 0;

  const hide = () => {
    window.clearTimeout(timer);
    if (on && box.classList.contains("show")) warmUntil = performance.now() + WARM_MS;
    on = null;
    box.classList.remove("show");
  };
  const show = (el: Element, text: string) => {
    box.textContent = text;
    box.classList.add("show");
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    const gap = 8, pad = 4, vw = window.innerWidth, vh = window.innerHeight;
    // Kept inside what the button sits in (its panel, dialog, bar or the map), the nearest one
    // with room for the tip below or above the button; failing that, inside the window
    const screen = { left: 0, top: 0, right: vw, bottom: vh };
    let frame = screen;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (!a.matches(FRAME) && getComputedStyle(a).overflow === "visible") continue;
      const f = a.getBoundingClientRect();
      const box2 = { left: Math.max(0, f.left), top: Math.max(0, f.top), right: Math.min(vw, f.right), bottom: Math.min(vh, f.bottom) };
      const wide = box2.right - box2.left >= b.width + 2 * pad;
      const tall = box2.bottom - (r.bottom + gap) >= b.height + pad || r.top - gap - box2.top >= b.height + pad;
      if (wide && tall) { frame = box2; break; }
    }
    // Below it, or above where there's no room below
    let top = r.bottom + gap;
    if (top + b.height > frame.bottom - pad) top = r.top - gap - b.height;
    top = Math.min(Math.max(frame.top + pad, top), frame.bottom - b.height - pad);
    const left = Math.min(Math.max(frame.left + pad, r.left + r.width / 2 - b.width / 2), frame.right - b.width - pad);
    box.style.transform = `translate(${Math.round(Math.max(pad, left))}px, ${Math.round(Math.max(pad, top))}px)`;
  };

  document.addEventListener("pointerover", e => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element | null)?.closest?.(PICK) ?? null;
    if (el === on) return;
    hide();
    // (none while a button is held: something is being dragged or drawn)
    if (!el || e.buttons || (el as HTMLButtonElement).disabled && !el.getAttribute("data-tip")) return;
    const text = tipOf(el);
    if (!text) return;
    on = el;
    const go = () => { if (on === el && el.isConnected) show(el, text); };
    if (onMap(el)) timer = window.setTimeout(go, Math.max(MAP_REST_MS, mapQuietUntil - performance.now()));
    else if (performance.now() < warmUntil) go();
    else timer = window.setTimeout(go, FIRST_MS);
  }, true);
  // On the map: a pointer moving on a point starts its wait again (shown only once it rests), and
  // one being used (pressed, dragged) hides it
  document.addEventListener("pointermove", e => {
    if (!on || !onMap(on) || e.pointerType !== "mouse") return;
    if (e.buttons) { hide(); mapQuietUntil = performance.now() + MAP_QUIET_MS; return; }
    if (box.classList.contains("show")) return;
    const el = on, text = el.getAttribute("data-tip") ?? "";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { if (on === el && el.isConnected && text) show(el, text); }, Math.max(MAP_REST_MS, mapQuietUntil - performance.now()));
  }, true);
  document.addEventListener("pointerdown", e => {
    if ((e.target as Element | null)?.closest?.('[data-testid="plan"]')) mapQuietUntil = performance.now() + MAP_QUIET_MS;
  }, true);
  document.addEventListener("pointerout", e => {
    if (on && !on.contains(e.relatedTarget as Node | null)) hide();
  }, true);
  for (const ev of ["pointerdown", "keydown", "wheel", "scroll", "blur"]) window.addEventListener(ev, hide, true);
}
