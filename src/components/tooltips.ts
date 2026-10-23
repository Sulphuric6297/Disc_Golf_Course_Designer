// What a button is, said when the mouse rests on it: anything with a title, and icon-only buttons by
// their label. One tip for the whole app, quicker and easier to read than the browser's own (which
// is kept from showing twice: the title moves to data-tip, and to aria-label when it named the
// button). Mouse only: a finger has no hover.

const PICK = "[title],[data-tip],button[aria-label],a[aria-label],[role=button][aria-label],[role=radio][aria-label],[role=tab][aria-label],[role=menuitem][aria-label]";
/** Waits before the first tip; once one has shown, the next comes at once. */
const FIRST_MS = 380, WARM_MS = 600;

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
  let on: Element | null = null, timer = 0, warmUntil = 0;

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
    const gap = 8, vw = window.innerWidth, vh = window.innerHeight;
    // Below it, or above where there's no room below
    let top = r.bottom + gap;
    if (top + b.height > vh - 4) top = r.top - gap - b.height;
    const left = Math.min(Math.max(4, r.left + r.width / 2 - b.width / 2), vw - b.width - 4);
    box.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(4, top))}px)`;
  };

  document.addEventListener("pointerover", e => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element | null)?.closest?.(PICK) ?? null;
    if (el === on) return;
    hide();
    if (!el || (el as HTMLButtonElement).disabled && !el.getAttribute("data-tip")) return;
    const text = tipOf(el);
    if (!text) return;
    on = el;
    const go = () => { if (on === el && el.isConnected) show(el, text); };
    if (performance.now() < warmUntil) go();
    else timer = window.setTimeout(go, FIRST_MS);
  }, true);
  document.addEventListener("pointerout", e => {
    if (on && !on.contains(e.relatedTarget as Node | null)) hide();
  }, true);
  for (const ev of ["pointerdown", "keydown", "wheel", "scroll", "blur"]) window.addEventListener(ev, hide, true);
}
