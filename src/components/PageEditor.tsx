// The course map's page in the Design step, edited loosely like Canva: everything on it (the map,
// the title, the hole guide, the legend, the north arrow, the scale bar, the credits, and text and
// pictures put on it) picked on the page or in the list, moved, sized, colored or hidden.
import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, ImagePlus, RotateCcw, Trash2, Type } from "lucide-react";
import { generateId } from "../constants";
import { PAGE_PANEL as PANEL, PAPER } from "../lib/mapSvg";
import { changeDoc, getDoc, useCourse, useEditor } from "../state/course";
import type { CourseDoc, MapStyle, PageElementId, PageElementStyle, PageImage, PageText } from "../types";
import { Button, ColorInput, Field, Section, Segmented, Slider, TextInput, Toggle } from "./ui";

const BUILT_IN: { id: PageElementId; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "holes", label: "Hole guide" },
  { id: "legend", label: "Legend" },
  { id: "north", label: "North arrow" },
  { id: "scale", label: "Scale bar" },
  { id: "credit", label: "Credits" }
];

const style = (patch: (s: MapStyle) => Partial<MapStyle>, history = true) => changeDoc(d => ({ style: { ...d.style, ...patch(d.style) } }), history);
const done = () => useCourse.getState().commit();

/** A built-in element's settings, changed. */
export const patchPage = (id: PageElementId, patch: Partial<PageElementStyle>, history = true) =>
  style(s => ({ page: { ...s.page, [id]: { ...s.page?.[id], ...patch } } }), history);
export const patchText = (id: string, patch: Partial<PageText>, history = true) =>
  style(s => ({ texts: (s.texts ?? []).map(t => (t.id === id ? { ...t, ...patch } : t)) }), history);
export const patchImage = (id: string, patch: Partial<PageImage>, history = true) =>
  style(s => ({ images: (s.images ?? []).map(t => (t.id === id ? { ...t, ...patch } : t)) }), history);

/** What a picked element is: a built-in one, a text or a picture. */
export const elementOf = (doc: CourseDoc, sel: string | null) => {
  if (!sel) return null;
  if (sel.startsWith("label:")) return { kind: "label", id: sel.slice(6) } as const;
  if (sel.startsWith("text:")) {
    const t = doc.style.texts?.find(x => x.id === sel.slice(5));
    return t ? ({ kind: "text", text: t } as const) : null;
  }
  if (sel.startsWith("image:")) {
    const im = doc.style.images?.find(x => x.id === sel.slice(6));
    return im ? ({ kind: "image", image: im } as const) : null;
  }
  const b = BUILT_IN.find(x => x.id === sel);
  return b ? ({ kind: "built", id: b.id, label: b.label } as const) : null;
};

export const elementLabel = (doc: CourseDoc, sel: string) => {
  const e = elementOf(doc, sel);
  if (!e) return "";
  if (e.kind === "text") return e.text.text.trim().split("\n")[0].slice(0, 28) || "Text";
  if (e.kind === "image") return "Picture";
  if (e.kind === "label") return LABEL_KINDS[e.id.split(":")[0]] ?? "Label";
  return e.label;
};

const LABEL_KINDS: Record<string, string> = { num: "Hole number", dist: "Distance", name: "Name", tag: "OB tag", text: "Text label", walk: "Walk to the next tee" };

/** A label on the map moved by (dx, dy) feet on the ground, hidden, or put back (null). */
export const patchLabel = (id: string, patch: { dx?: number; dy?: number; hidden?: boolean } | null) =>
  style(s => {
    const all = { ...s.labelAt };
    if (patch === null) delete all[id];
    else all[id] = { ...(all[id] ?? { dx: 0, dy: 0 }), ...patch };
    return { labelAt: Object.keys(all).length ? all : undefined };
  });
export const moveLabel = (id: string, dx: number, dy: number) => {
  const o = getDoc().style.labelAt?.[id];
  const r = (v: number) => Math.round(v * 10) / 10;
  patchLabel(id, { dx: r((o?.dx ?? 0) + dx), dy: r((o?.dy ?? 0) + dy) });
};

/** Whether an element shows on the page. */
export const isShown = (doc: CourseDoc, sel: string) => {
  const s = doc.style, e = elementOf(doc, sel);
  if (!e) return false;
  if (e.kind === "text") return !e.text.hidden;
  if (e.kind === "image") return !e.image.hidden;
  if (e.kind === "label") return !s.labelAt?.[e.id]?.hidden;
  switch (e.id) {
    case "holes": return s.holeTable;
    case "legend": return s.legend;
    case "north": return s.north;
    case "scale": return s.scale;
    case "map": return true;
    default: return !s.page?.[e.id]?.hidden;
  }
};

export const setShown = (sel: string, v: boolean) => {
  const e = elementOf(getDoc(), sel);
  if (!e) return;
  if (e.kind === "text") return patchText(e.text.id, { hidden: v ? undefined : true });
  if (e.kind === "image") return patchImage(e.image.id, { hidden: v ? undefined : true });
  if (e.kind === "label") return patchLabel(e.id, { hidden: v ? undefined : true });
  if (e.id === "holes") return style(() => ({ holeTable: v }));
  if (e.id === "legend") return style(() => ({ legend: v }));
  if (e.id === "north") return style(() => ({ north: v }));
  if (e.id === "scale") return style(() => ({ scale: v }));
  if (e.id !== "map") patchPage(e.id, { hidden: v ? undefined : true });
};

/** Delete (or Backspace) on the page: text and pictures go, the rest is hidden (one undo step). */
export const removeDesignSel = () => {
  const { designSel, set } = useEditor.getState();
  if (!designSel) return;
  const e = elementOf(getDoc(), designSel);
  if (!e) return;
  if (e.kind === "text") style(s => ({ texts: (s.texts ?? []).filter(t => t.id !== e.text.id) }));
  else if (e.kind === "image") style(s => ({ images: (s.images ?? []).filter(t => t.id !== e.image.id) }));
  else if (e.kind === "label" || e.id !== "map") setShown(designSel, false);
  else return;
  set({ designSel: null });
};

/** Ctrl+D on the page: a copy of a text or picture, a little down and to the right. */
export const duplicateDesignSel = () => {
  const { designSel, set } = useEditor.getState();
  const e = designSel ? elementOf(getDoc(), designSel) : null;
  if (!e || e.kind === "built" || e.kind === "label") return;
  const id = generateId();
  if (e.kind === "text") {
    style(s => ({ texts: [...(s.texts ?? []), { ...e.text, id, x: e.text.x + 0.02, y: e.text.y + 0.02 }] }));
    set({ designSel: `text:${id}` });
  } else {
    style(s => ({ images: [...(s.images ?? []), { ...e.image, id, x: e.image.x + 0.02, y: e.image.y + 0.02 }] }));
    set({ designSel: `image:${id}` });
  }
};

/** An element moved by a share of the page across and down (`at`: its top-left corner, as a share of the page, before). */
export const moveDesignEl = (sel: string, at: { x: number; y: number }, dx: number, dy: number) => {
  const doc = getDoc();
  const e = elementOf(doc, sel);
  if (!e || e.kind === "label") return;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  if (e.kind === "text") return patchText(e.text.id, { x: r(e.text.x + dx), y: r(e.text.y + dy) });
  if (e.kind === "image") return patchImage(e.image.id, { x: r(e.image.x + dx), y: r(e.image.y + dy) });
  if (e.id === "map") {
    const m = doc.style.page?.map;
    return patchPage("map", { x: r((m?.x ?? 0) + dx), y: r((m?.y ?? 0) + dy) });
  }
  patchPage(e.id, { x: r(at.x + dx), y: r(at.y + dy) });
};

/** An element sized `f` times about a point that stays (`to`: its new top-left corner, as a share of the page). */
export const sizeDesignEl = (sel: string, f: number, to: { x: number; y: number }) => {
  const doc = getDoc();
  const e = elementOf(doc, sel);
  if (!e || e.kind === "label") return;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  if (e.kind === "text") return patchText(e.text.id, { size: Math.round(Math.max(4, Math.min(400, e.text.size * f)) * 10) / 10, x: r(to.x), y: r(to.y) });
  if (e.kind === "image") return patchImage(e.image.id, { w: r(Math.max(0.02, Math.min(1.5, e.image.w * f))), x: r(to.x), y: r(to.y) });
  if (e.id === "map") return;
  const k = Math.max(0.2, Math.min(6, (doc.style.page?.[e.id]?.scale ?? 1) * f));
  patchPage(e.id, { scale: Math.round(k * 1000) / 1000, x: r(to.x), y: r(to.y) });
};

/** A text size that reads well on the paper picked (points). */
const textSize = (s: MapStyle) => {
  const p = PAPER[s.paper];
  return Math.round(Math.min(p.w, p.h) * 72 * 0.04);
};

export const addText = () => {
  const id = generateId();
  style(s => ({ texts: [...(s.texts ?? []), { id, text: "Text", x: 0.42, y: 0.45, size: textSize(s), color: "#ffffff", font: s.font, bold: true }] }));
  useEditor.getState().set({ designSel: `text:${id}` });
};

/** A picture picked from the device, made at most `max` px across (the course file stays light):
 * as a data URL, and its height to width. */
export const pictureFrom = async (file: File, max = 1200) => {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9), aspect: c.height / c.width };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** A picture picked from the device, put on the course map's page. */
export const addImage = async (file: File) => {
  const { src, aspect } = await pictureFrom(file);
  const id = generateId();
  // (a quarter of the page across, in its own shape)
  style(s => ({ images: [...(s.images ?? []), { id, src, x: 0.375, y: 0.4, w: 0.25, aspect }] }));
  useEditor.getState().set({ designSel: `image:${id}` });
};

const FONTS = [
  { value: "Script", label: <span style={{ fontFamily: "Kaushan Script" }}>Script</span> },
  { value: "Oswald", label: <span style={{ fontFamily: "Oswald" }}>Oswald</span> },
  { value: "Inter", label: <span style={{ fontFamily: "Inter" }}>Inter</span> },
  { value: "Bitter", label: <span style={{ fontFamily: "Bitter" }}>Bitter</span> }
] as const;

/** A slider that changes the page when let go (one undo step). */
function LiveSlider({ value, label, min, max, step, format, onDone }: { value: number; label: string; min: number; max: number; step: number; format: (v: number) => string; onDone: (v: number) => void }) {
  const [v, setV] = useState(value);
  const moved = useRef(false);
  useEffect(() => { setV(value); }, [value]);
  return <Slider label={label} min={min} max={max} step={step} value={v} format={format} onChange={x => { moved.current = true; setV(x); }} onDone={() => { if (moved.current && v !== value) onDone(v); moved.current = false; }} />;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The picked element's settings (at the top of the Design panel). */
export function PageElementPanel() {
  const doc = useCourse(s => s.doc);
  const sel = useEditor(e => e.designSel);
  const set = useEditor(e => e.set);
  const e = elementOf(doc, sel);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const isNewText = e?.kind === "text" && e.text.text === "Text";
  useEffect(() => {
    if (isNewText) textArea.current?.select();
  }, [sel, isNewText]);
  if (!sel || !e) return null;
  const s = doc.style;
  const title = elementLabel(doc, sel);
  const close = <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => set({ designSel: null })}>Done</button>;
  const actions = (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {e.kind !== "built" && <Button small onClick={duplicateDesignSel} testid="page-duplicate"><Copy size={13} /> Duplicate</Button>}
      {e.kind === "built" && e.id !== "map" && <Button small onClick={() => setShown(sel, false)} testid="page-hide"><EyeOff size={13} /> Hide</Button>}
      {e.kind !== "built" && <Button small tone="danger" onClick={removeDesignSel} testid="page-delete"><Trash2 size={13} /> Delete</Button>}
    </div>
  );
  if (e.kind === "label") {
    const o = s.labelAt?.[e.id];
    return (
      <Section title={title} testid="page-selected" right={close}>
        <div className="flex flex-wrap gap-1.5">
          {o && (o.dx || o.dy) ? <Button small onClick={() => patchLabel(e.id, o.hidden ? { dx: 0, dy: 0 } : null)} testid="page-reset"><RotateCcw size={13} /> Back in place</Button> : null}
          <Button small onClick={() => setShown(sel, false)} testid="page-hide"><EyeOff size={13} /> Hide</Button>
        </div>
      </Section>
    );
  }
  if (e.kind === "text") {
    const t = e.text;
    return (
      <Section title={`Text: ${title}`} testid="page-selected" right={close}>
        <textarea ref={textArea} aria-label="Text on the page" data-testid="page-text" className="w-full bg-white/[0.07] rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-400/80 min-h-[64px]" value={t.text} onChange={ev => patchText(t.id, { text: ev.target.value }, false)} onBlur={done} />
        <Field label="Font"><Segmented label="Text font" value={t.font ?? s.font} onChange={v => patchText(t.id, { font: v })} options={FONTS.map(f => ({ ...f }))} /></Field>
        <LiveSlider label="Size" value={t.size} min={4} max={200} step={1} format={v => `${Math.round(v)} pt`} onDone={v => patchText(t.id, { size: v })} />
        <div className="grid grid-cols-2 gap-x-3">
          <ColorInput label="Color" value={t.color} onChange={v => patchText(t.id, { color: v }, false)} onDone={done} />
          <ColorInput label="Panel" value={t.bg ?? "#0b0f0a"} onChange={v => patchText(t.id, { bg: v, bgOpacity: t.bgOpacity ?? 0.85 }, false)} onDone={done} />
        </div>
        {t.bg && <LiveSlider label="Panel" value={t.bgOpacity ?? 1} min={0} max={1} step={0.05} format={pct} onDone={v => patchText(t.id, { bgOpacity: v })} />}
        <div className="flex gap-3">
          <Toggle label="Bold" checked={!!t.bold} onChange={v => patchText(t.id, { bold: v || undefined })} />
          <Toggle label="Italic" checked={!!t.italic} onChange={v => patchText(t.id, { italic: v || undefined })} />
        </div>
        <Field label="Lines"><Segmented label="Text alignment" value={t.align ?? "start"} onChange={v => patchText(t.id, { align: v === "start" ? undefined : v })} options={[{ value: "start", label: "Left" }, { value: "middle", label: "Center" }, { value: "end", label: "Right" }]} /></Field>
        {actions}
      </Section>
    );
  }
  if (e.kind === "image") {
    const im = e.image;
    return (
      <Section title="Picture" testid="page-selected" right={close}>
        <img src={im.src} alt="" className="max-h-24 rounded bg-white/10 mb-2" />
        <LiveSlider label="Width" value={im.w} min={0.02} max={1} step={0.01} format={pct} onDone={v => patchImage(im.id, { w: v })} />
        <LiveSlider label="Opacity" value={im.opacity ?? 1} min={0.05} max={1} step={0.05} format={pct} onDone={v => patchImage(im.id, { opacity: v })} />
        {actions}
      </Section>
    );
  }
  const id = e.id;
  const o = s.page?.[id] ?? {};
  const moved = o.x !== undefined || o.y !== undefined || o.scale !== undefined || (id === "legend" && !!s.legendAt);
  const reset = () => style(st => ({ page: { ...st.page, [id]: { ...st.page?.[id], x: undefined, y: undefined, scale: undefined } }, ...(id === "legend" || id === "holes" ? { legendAt: undefined } : {}) }));
  const panelColors = (
    <>
      <div className="grid grid-cols-2 gap-x-3">
        <ColorInput label="Panel" value={o.bg ?? PANEL.bg} onChange={v => patchPage(id, { bg: v }, false)} onDone={done} />
        <ColorInput label="Text" value={o.ink ?? PANEL.ink} onChange={v => patchPage(id, { ink: v }, false)} onDone={done} />
      </div>
      <LiveSlider label="Panel" value={o.bgOpacity ?? PANEL.opacity} min={0} max={1} step={0.05} format={pct} onDone={v => patchPage(id, { bgOpacity: v })} />
    </>
  );
  return (
    <Section title={title} testid="page-selected" right={close}>
      <LiveSlider label="Size" value={o.scale ?? 1} min={0.2} max={4} step={0.05} format={v => `${Math.round(v * 100)}%`} onDone={v => patchPage(id, { scale: v })} />
      {id === "title" && (
        <>
          <Field label="Title"><TextInput label="Map title" value={s.title} placeholder={doc.name} onChange={v => style(() => ({ title: v }))} /></Field>
          <Field label="Subtitle"><TextInput label="Map subtitle" value={s.subtitle} onChange={v => style(() => ({ subtitle: v }))} /></Field>
          <div className="grid grid-cols-2 gap-x-3">
            <ColorInput label="Lettering" value={o.ink ?? "#ffffff"} onChange={v => patchPage(id, { ink: v }, false)} onDone={done} />
            <ColorInput label="Glow" value={o.bg ?? "#050b04"} onChange={v => patchPage(id, { bg: v }, false)} onDone={done} />
          </div>
          <LiveSlider label="Glow" value={o.bgOpacity ?? 0.55} min={0} max={1} step={0.05} format={pct} onDone={v => patchPage(id, { bgOpacity: v })} />
        </>
      )}
      {id === "holes" && (
        <>
          <Field label="Heading"><TextInput label="Hole guide heading" value={o.heading ?? ""} placeholder="None" onChange={v => patchPage(id, { heading: v || undefined })} /></Field>
          <Field label="Columns">
            <div className="flex flex-wrap gap-x-3" data-testid="hole-guide-columns">
              {([["names", "Names"], ["par", "Par"], ["lengths", "Lengths"], ["elevation", "Elevation"]] as const).map(([c, label]) => {
                const cols = o.columns ?? ["par", "lengths"];
                return <Toggle key={c} label={label} checked={cols.includes(c)} onChange={v => patchPage(id, { columns: v ? [...cols, c] : cols.filter(x => x !== c) })} />;
              })}
            </div>
          </Field>
          {panelColors}
        </>
      )}
      {id === "legend" && (
        <>
          <Field label="Heading"><TextInput label="Legend heading" value={o.heading ?? "Legend"} onChange={v => patchPage(id, { heading: v })} /></Field>
          {panelColors}
        </>
      )}
      {id === "credit" && (
        <>
          <Field label="Note"><TextInput label="Footer note" value={s.footer} onChange={v => style(() => ({ footer: v }))} /></Field>
          <ColorInput label="Color" value={o.ink ?? "#ffffff"} onChange={v => patchPage(id, { ink: v }, false)} onDone={done} />
        </>
      )}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {moved && <Button small onClick={reset} testid="page-reset"><RotateCcw size={13} /> Back in place</Button>}
      </div>
      {actions}
    </Section>
  );
}

/** Everything on the page, each shown or hidden and picked from here; text and pictures added. */
export function PageSection() {
  const doc = useCourse(s => s.doc);
  const sel = useEditor(e => e.designSel);
  const set = useEditor(e => e.set);
  const file = useRef<HTMLInputElement>(null);
  const s = doc.style;
  const rows = [...BUILT_IN.map(b => b.id as string), ...(s.texts ?? []).map(t => `text:${t.id}`), ...(s.images ?? []).map(im => `image:${im.id}`)];
  return (
    <Section title="On the page" testid="page-elements">
      <ul className="space-y-0.5 mb-2">
        {rows.map(r => {
          const shown = isShown(doc, r);
          return (
            <li key={r} className={`flex items-center gap-1 rounded-lg ${sel === r ? "bg-orange-500/15 ring-1 ring-orange-400/60" : "hover:bg-white/[0.09]"}`}>
              <button className="flex-1 min-w-0 text-left text-sm px-2 py-1.5 touch:py-2.5 truncate text-zinc-100 flex items-center gap-1.5" data-testid="page-element" onClick={() => set({ designSel: r })}>
                {r.startsWith("text:") ? <Type size={13} className="text-zinc-400 shrink-0" /> : r.startsWith("image:") ? <ImagePlus size={13} className="text-zinc-400 shrink-0" /> : null}
                <span className={`truncate ${shown ? "" : "text-zinc-500"}`}>{elementLabel(doc, r)}</span>
              </button>
              {r !== "map" && (
                <button className="p-1.5 touch:p-3 rounded text-zinc-400 hover:text-zinc-100" aria-label={`${shown ? "Hide" : "Show"} ${elementLabel(doc, r)}`} aria-pressed={shown} onClick={() => setShown(r, !shown)}>
                  {shown ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {Object.values(s.labelAt ?? {}).some(o => o.hidden) && (
        <div className="mb-2"><Button small onClick={() => style(st => ({ labelAt: Object.fromEntries(Object.entries(st.labelAt ?? {}).map(([k, o]) => [k, { ...o, hidden: undefined }])) }))} testid="page-show-labels"><Eye size={13} /> Show hidden labels ({Object.values(s.labelAt ?? {}).filter(o => o.hidden).length})</Button></div>
      )}
      <div className="flex gap-1.5">
        <Button small onClick={addText} testid="page-add-text"><Type size={13} /> Add text</Button>
        <Button small onClick={() => file.current?.click()} testid="page-add-image"><ImagePlus size={13} /> Add picture</Button>
        <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Picture file" data-testid="page-image-input" onChange={ev => { const f = ev.target.files?.[0]; if (f) void addImage(f); ev.target.value = ""; }} />
      </div>
    </Section>
  );
}
