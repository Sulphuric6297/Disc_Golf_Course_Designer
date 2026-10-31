// A course from someone else (on a GlideLine Studio server) is cleaned before it's shown, because parts
// of the map are drawn from markup built out of the course's values: pictures must be images
// (data URLs), and only free text (names, labels, notes) may hold < > " or `.

const FREE_TEXT = new Set(["name", "label", "text", "title", "subtitle", "notes", "heading", "footer", "designer"]);
const PICTURES = new Set(["background", "logo", "src"]);
const IMAGE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

const clean = (v: unknown, key: string): unknown => {
  if (typeof v === "string") {
    if (PICTURES.has(key)) return IMAGE.test(v) ? v : key === "background" ? null : "";
    return FREE_TEXT.has(key) ? v : v.replace(/[<>"`]/g, "");
  }
  if (Array.isArray(v)) return v.map(x => clean(x, key));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = clean(x, k);
    return out;
  }
  return v;
};

export const safeDoc = <T>(doc: T): T => clean(doc, "") as T;
