// The panel beside a printout's page, the same for the course map, tee signs, hole pages and the
// scorecard: Add (text, a picture, a QR code, each of the course's sponsors on its own), then
// Layers (everything on the page: click a name to pick it, the eye to hide it or bring it back).
// What's picked is set up on the page itself, in the toolbar over it.
import { useRef, useState } from "react";
import { ChevronRight, Eye, EyeOff, ImagePlus, Layers as LayersIcon, Plus, QrCode, RotateCcw, Star, Trash2, Type } from "lucide-react";
import { generateId } from "../constants";
import { HOLE_PAGE_LOOKS } from "../lib/holePage";
import { holeLabel } from "../lib/course";
import { changeDoc, useCourse, useEditor } from "../state/course";
import type { Sponsor } from "../types";
import { addImage, addText, pictureFrom } from "./PageEditor";
import { addExtra, holeHasOwn, holeName, layersOf, resetHoleOwn, setLayerShown, type TargetKey } from "./printouts";
import { Field, Section, Segmented, Slider, TextInput, Toggle } from "./ui";

const TITLE: Record<TargetKey, string> = { map: "Course map", sign: "Tee sign", page: "Hole page", card: "Scorecard" };

/** Add: text, a picture, a QR code, or one of the sponsors. */
function AddPieces({ t }: { t: TargetKey }) {
  const file = useRef<HTMLInputElement>(null);
  const doc = useCourse(c => c.doc);
  const sponsors = doc.style.sponsors ?? [];
  const b = "flex flex-col items-center justify-center gap-1 rounded-[14px] bg-white/[0.07] hover:bg-white/[0.13] py-2.5 touch:py-3.5 text-[12px] font-semibold text-zinc-100";
  const text = () => (t === "map" ? addText() : addExtra({ kind: "text", text: t === "card" ? "Thanks for playing!" : "Hole {hole}", size: t === "card" ? 14 : 36, color: "#111111", bold: true }));
  return (
    <div data-testid="add-pieces">
      <div className="grid grid-cols-3 gap-1.5">
        <button className={b} onClick={text} data-testid="add-text"><Type size={18} className="text-orange-300" /> Text</button>
        <button className={b} onClick={() => file.current?.click()} data-testid="add-picture"><ImagePlus size={18} className="text-orange-300" /> Picture</button>
        <button className={b} onClick={() => addExtra({ kind: "qr", url: "", w: t === "card" ? 0.08 : 0.12, text: "Scan for the course", size: 11 })} data-testid="add-qr"><QrCode size={18} className="text-orange-300" /> QR code</button>
      </div>
      {t !== "map" && t !== "card" && <p className="text-[11.5px] text-zinc-500 mt-1.5 px-1">{"Text can say {hole}, {par}, {length}, {course} or {name}: each hole fills in its own."}</p>}
      {sponsors.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[11.5px] font-semibold text-zinc-400 px-1 mb-1">Sponsors (each one goes where you put it)</div>
          <div className="flex flex-wrap gap-1.5">
            {sponsors.map(sp => (
              <button key={sp.id} className="flex items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] pl-1 pr-3 py-1 text-[12.5px] font-semibold text-zinc-100" onClick={() => addExtra({ kind: "sponsor", sponsorId: sp.id, w: 0.16, size: 16 })} data-testid="add-sponsor-piece">
                {sp.logo ? <img src={sp.logo} alt="" className="h-6 w-6 rounded-full object-contain bg-white" /> : <Star size={14} className="ml-1.5 text-orange-300" />}{sp.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Picture for the page" data-testid="page-image-input" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (t === "map") return void addImage(f); const p = await pictureFrom(f); addExtra({ kind: "image", src: p.src, aspect: p.aspect }); }} />
    </div>
  );
}

/** Layers: everything on the page, to pick, hide or bring back. */
export function Layers({ t }: { t: TargetKey }) {
  const doc = useCourse(c => c.doc);
  const sel = useEditor(e => e.designSel);
  const set = useEditor(e => e.set);
  const rows = layersOf(doc, t);
  return (
    <div className="rounded-[16px] bg-white/[0.05] py-1" role="list" aria-label="Layers" data-testid="layers">
      {rows.map(r => {
        const picked = sel === r.id;
        return (
          <div key={r.id} role="listitem" className={`flex items-center gap-1 px-1.5 ${picked ? "bg-orange-400/15" : ""}`}>
            <button className={`flex-1 min-w-0 text-left px-1.5 py-1.5 touch:py-3 text-[13px] truncate ${r.shown ? "text-zinc-100" : "text-zinc-500"} ${picked ? "font-semibold" : ""}`} onClick={() => set({ designSel: picked ? null : r.id })} data-testid="layer" data-layer={r.id}>
              {r.label}{r.changed && <span className="ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-orange-400 align-middle" aria-label="Changed" />}
            </button>
            <button className="p-1.5 touch:p-3 rounded hover:bg-white/[0.1] text-zinc-400" aria-label={r.shown ? `Hide ${r.label}` : `Show ${r.label}`} aria-pressed={r.shown} title={r.shown ? "Hide" : "Show"} onClick={() => setLayerShown(t, r.id, !r.shown)}>
              {r.shown ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Which holes something shows on: every hole, or the holes ticked. */
export function HolePicker({ holes, onChange }: { holes?: string[]; onChange: (v: string[] | undefined) => void }) {
  const doc = useCourse(c => c.doc);
  const every = !holes?.length;
  return (
    <div className="mt-1">
      <Toggle label="On every hole" checked={every} onChange={v => onChange(v ? undefined : doc.holes.slice(0, 1).map(h => h.id))} />
      {!every && (
        <div className="flex flex-wrap gap-1 mt-1">
          {doc.holes.map(h => {
            const on = holes!.includes(h.id);
            return <button key={h.id} className={`min-w-8 touch:min-w-11 touch:h-11 px-2 py-1 rounded-full text-[12px] font-semibold ${on ? "bg-orange-400 text-zinc-950" : "bg-white/[0.08] text-zinc-300"}`} aria-pressed={on} onClick={() => { const next = on ? holes!.filter(x => x !== h.id) : [...holes!, h.id]; onChange(next.length ? next : undefined); }}>{holeLabel(doc, h.id)}</button>;
          })}
        </div>
      )}
    </div>
  );
}

/** The course's sponsors: a logo, a line of text, or both, on every hole or the holes picked. */
export function Sponsors() {
  const doc = useCourse(c => c.doc);
  const list = doc.style.sponsors ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const forLogo = useRef<string | null>(null);
  const put = (f: (xs: Sponsor[]) => Sponsor[]) => changeDoc(d => ({ style: { ...d.style, sponsors: f(d.style.sponsors ?? []) } }));
  const patch = (id: string, p: Partial<Sponsor>) => put(xs => xs.map(x => (x.id === id ? { ...x, ...p } : x)));
  const add = () => { const id = generateId(); put(xs => [...xs, { id, name: `Sponsor ${xs.length + 1}` }]); setOpen(id); };
  return (
    <div data-testid="sponsors">
      {!list.length && <p className="text-[12px] text-zinc-400 px-1 mb-2">Each sponsor can have a logo, a line of text, or both, on every hole or the holes you pick. Once added, put each one on the page from Add.</p>}
      <div className="flex flex-col gap-1.5">
        {list.map(sp => (
          <div key={sp.id} className="rounded-[14px] bg-white/[0.05]">
            <button className="w-full flex items-center gap-2.5 px-2.5 py-2 touch:py-3 text-left" aria-expanded={open === sp.id} onClick={() => setOpen(open === sp.id ? null : sp.id)}>
              <span className="w-9 h-9 shrink-0 rounded-[10px] bg-white flex items-center justify-center overflow-hidden">{sp.logo ? <img src={sp.logo} alt="" className="max-w-full max-h-full object-contain" /> : <Star size={15} className="text-zinc-500" />}</span>
              <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold text-zinc-100 truncate">{sp.name}</span><span className="block text-[11.5px] text-zinc-400">{[sp.logo ? "Logo" : "", sp.text ? "text" : ""].filter(Boolean).join(" and ") || "Name only"} · {sp.holes?.length ? `Holes ${sp.holes.map(h => holeLabel(doc, h)).join(", ")}` : "Every hole"}</span></span>
              <ChevronRight size={15} className={`text-zinc-500 transition-transform ${open === sp.id ? "rotate-90" : ""}`} />
            </button>
            {open === sp.id && (
              <div className="px-2.5 pb-2.5">
                <Field label="Name"><TextInput label="Sponsor name" value={sp.name} onChange={v => patch(sp.id, { name: v })} /></Field>
                <Field label="Text on the page"><TextInput label="Text on the page" value={sp.text ?? ""} onChange={v => patch(sp.id, { text: v || undefined })} placeholder={sp.logo ? "None (the logo alone)" : sp.name} /></Field>
                <div className="flex gap-2 my-1.5">
                  <button className="text-xs font-semibold text-orange-300 hover:text-orange-200" onClick={() => { forLogo.current = sp.id; file.current?.click(); }}>{sp.logo ? "Another logo" : "Add a logo"}</button>
                  {sp.logo && <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => patch(sp.id, { logo: undefined, aspect: undefined })}>No logo</button>}
                </div>
                <HolePicker holes={sp.holes} onChange={v => patch(sp.id, { holes: v })} />
                <button className="mt-2 text-xs text-red-300 hover:text-red-200 flex items-center gap-1" onClick={() => put(xs => xs.filter(x => x.id !== sp.id))}><Trash2 size={12} /> Remove {sp.name}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="mt-2 w-full rounded-full bg-white/[0.08] hover:bg-white/[0.14] px-3 py-2 touch:py-3 text-[13px] font-semibold text-zinc-100 flex items-center justify-center gap-1.5" onClick={add} data-testid="add-sponsor"><Plus size={14} /> Add a sponsor</button>
      <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Sponsor logo" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; const id = forLogo.current; if (f && id) { const p = await pictureFrom(f, 800); patch(id, { logo: p.src, aspect: p.aspect }); } }} />
    </div>
  );
}

/** The panel for printout `t`: what it starts from (`top`), Add, Layers, its other settings
 * (`children`) and Sponsors. */
export function PrintPanel({ t, top, children }: { t: TargetKey; top?: React.ReactNode; children?: React.ReactNode }) {
  const doc = useCourse(c => c.doc);
  const own = holeHasOwn(doc, t);
  return (
    <>
      {top}
      <Section title="Add" testid="print-add" help="printout-editing">
        <AddPieces t={t} />
      </Section>
      <Section title={<span className="flex items-center gap-1.5"><LayersIcon size={14} /> Layers</span>} testid="print-layers">
        <p className="text-[11.5px] text-zinc-500 mb-1.5 px-1">Click a piece on the {TITLE[t].toLowerCase()} (or its name here). Its settings show right over it.</p>
        <Layers t={t} />
        {t === "map" && Object.values(doc.style.labelAt ?? {}).some(o => o.hidden) && (
          <button className="mt-2 text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => changeDoc(d => ({ style: { ...d.style, labelAt: Object.fromEntries(Object.entries(d.style.labelAt ?? {}).map(([k, o]) => [k, { ...o, hidden: undefined }])) } }))} data-testid="page-show-labels"><Eye size={12} /> Show the hidden labels on the map ({Object.values(doc.style.labelAt ?? {}).filter(o => o.hidden).length})</button>
        )}
        {own && <button className="mt-2 text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => resetHoleOwn(t)} data-testid="hole-own-reset"><RotateCcw size={12} /> Hole {holeName(doc)} has its own changes: reset them</button>}
      </Section>
      {children}
      <Section title="Sponsors" testid="print-sponsors" help="sponsors">
        <Sponsors />
      </Section>
    </>
  );
}

/** The hole page's look. */
export function HolePageLook() {
  const doc = useCourse(c => c.doc);
  const look = doc.style.holePage?.look ?? "standard";
  return (
    <Section title="Hole pages" testid="page-settings" help="hole-pages">
      <Field label="Start from">
        <Segmented label="Hole page look" value={look} onChange={v => changeDoc(d => ({ style: { ...d.style, holePage: { ...d.style.holePage, look: v === "standard" ? undefined : v, layout: undefined } } }))} options={HOLE_PAGE_LOOKS.map(l => ({ value: l.id, label: l.label }))} />
      </Field>
    </Section>
  );
}

/** The scorecard's own settings: how many players it has rows for. */
export function ScorecardSettings() {
  const doc = useCourse(c => c.doc);
  const players = doc.style.scorecard?.players ?? 5;
  return (
    <Section title="Scorecard" testid="card-settings" help="scorecard">
      <Slider label="Rows for players" min={2} max={8} step={1} value={players} onChange={v => changeDoc(d => ({ style: { ...d.style, scorecard: { ...d.style.scorecard, players: v } } }), false)} onDone={() => useCourse.getState().commit()} format={v => `${v}`} />
    </Section>
  );
}
