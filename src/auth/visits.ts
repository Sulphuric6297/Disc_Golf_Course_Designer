// Counting a visit to a course's public page (the server's /visit and /ping, routes/public): no
// cookies, nothing kept on this device. Where it came from (a tee sign's QR code says which sign),
// phone or computer, the visitor's own day and hour; then about once a minute while it's open and
// as it closes, how long so far, and each hole looked at and flyover played.
import { holeLabel } from "../lib/course";
import { useCourse, useEditor } from "../state/course";

let visit: { v: string; day: string } | null = null;
let base = "", password = "";
const start = Date.now();
// (each hole and flyover counted once a visit: how many people looked at it, not how often)
const seen = new Set<string>();

const send = (path: string, body: unknown, keepalive = false) =>
  fetch(`${base}${path}`, { method: "POST", keepalive, headers: { "content-type": "application/json", "x-hyzerlab": "1", ...(password ? { "x-link-password": password } : {}) }, body: JSON.stringify(body) });

const ping = (extra: { hole?: string; flyover?: string } = {}, closing = false) => {
  if (!visit) return;
  void send("/ping", { ...visit, seconds: Math.min(14_400, Math.round((Date.now() - start) / 1000)), ...extra }, closing).catch(() => {});
};

/** Counts this visit, once the page has opened (`token` its link, `pw` the link's password). */
export const countVisit = async (token: string, pw: string) => {
  if (visit) return;
  base = `./api/public/${token}`;
  password = pw;
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const from = new URLSearchParams(location.search).get("from") ?? undefined;
  const phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 768;
  try {
    const res = await send("/visit", { from, ref: document.referrer || undefined, phone, day, dow: now.getDay(), hour: now.getHours() });
    if (!res.ok) return;
    visit = await res.json();
  } catch { return; }
  // (while it's in sight; and as it's left)
  window.setInterval(() => { if (document.visibilityState === "visible") ping(); }, 60_000);
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") ping({}, true); });
  addEventListener("pagehide", () => ping({}, true));
  // A hole stood on or flown over, in the course looked round
  useEditor.subscribe((s, p) => {
    if (s.teeView && (s.teeView !== p.teeView || s.flyover !== p.flyover)) {
      const doc = useCourse.getState().doc;
      if (!doc.holes.some(h => h.id === s.teeView)) return;
      const label = holeLabel(doc, s.teeView);
      if (s.flyover) countFlyover(label);
      else countHole(label);
    }
  });
};

/** A hole looked at (by its number), once a visit. */
export const countHole = (label: string) => {
  if (seen.has(`h${label}`)) return;
  seen.add(`h${label}`);
  ping({ hole: label });
};

/** A hole's flyover played (by its number), once a visit. */
export const countFlyover = (label: string) => {
  if (seen.has(`f${label}`)) return;
  seen.add(`f${label}`);
  ping({ flyover: label });
};
