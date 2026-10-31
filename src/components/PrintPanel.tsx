// The panel beside a printout's page, the same for the course map, tee signs, hole pages and the
// scorecard: Add (text, a picture, a QR code, the hole's sponsors or each of the course's sponsors
// on its own), then Layers (everything on the page: click a name to pick it, the eye to hide it or
// bring it back). What's picked is set up on the page itself, in the toolbar over it. The sponsors
// themselves are kept on the General tab.
import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, Eye, EyeOff, Handshake, ImagePlus, ListTree, Plus, QrCode, Star, Trash2, Type } from "lucide-react";
import { generateId } from "../constants";
import { HOLE_PAGE_LOOKS } from "../lib/holePage";
import { byNumber, holeLabel } from "../lib/course";
import { changeDoc, useCourse, useEditor } from "../state/course";
import type { Sponsor } from "../types";
import { ApplyToHoles, HoleChips } from "./ApplyToHoles";
import { addImage, addText, pictureFrom, textSize } from "./PageEditor";
import { addExtra, askTyping, drawnNow, holesWithOwn, layersOf, onDrawn, putBack, removeSponsor, setLayerShown, type Layer, type TargetKey } from "./printouts";
import { Button, Field, Section, Segmented, Slider, TextInput } from "./ui";

/** Add: text, a picture, a QR code, the hole's sponsors, or one of the sponsors (a row each, its
 * + putting it on this page). */
function AddPieces({ t }: { t: TargetKey }) {
  const file = useRef<HTMLInputElement>(null);
  const doc = useCourse(c => c.doc);
  const sponsors = doc.style.sponsors ?? [];
  const perHole = t === "sign" || t === "page";
  const b = "flex flex-col items-center justify-center gap-1 rounded-[14px] bg-white/[0.07] hover:bg-white/[0.13] py-2.5 touch:py-3.5 text-[12px] font-semibold text-zinc-100";
  // (its lettering in the look's own ink until it's given a color)
  const text = () => (t === "map" ? addText() : addExtra({ kind: "text", text: t === "card" ? "Thanks for playing!" : "Hole {hole}", size: t === "card" ? 14 : 36, bold: true }));
  return (
    <div data-testid="add-pieces">
      <div className={`grid ${perHole && sponsors.length ? "grid-cols-4" : "grid-cols-3"} gap-1.5`}>
        <button className={b} onClick={text} data-testid="add-text"><Type size={18} className="text-orange-300" /> Text</button>
        <button className={b} onClick={() => file.current?.click()} data-testid="add-picture"><ImagePlus size={18} className="text-orange-300" /> Picture</button>
        <button className={b} onClick={() => addExtra({ kind: "qr", url: "", w: t === "card" ? 0.08 : 0.12, text: "Scan for the course", size: t === "map" ? Math.round(textSize(doc.style) * 0.45) : 11 })} data-testid="add-qr"><QrCode size={18} className="text-orange-300" /> QR code</button>
        {/* (one piece for whoever sponsors each hole: the same place on every sign, each its own sponsors) */}
        {perHole && sponsors.length > 0 && <button className={b} onClick={() => addExtra({ kind: "sponsors", w: 0.3, size: 14 })} data-testid="add-hole-sponsor"><Handshake size={18} className="text-orange-300" /> Hole sponsor</button>}
      </div>
      {sponsors.length > 0 && (
        <div className="mt-2 rounded-[14px] bg-white/[0.05] py-1" role="list" aria-label="Sponsors">
          {sponsors.map(sp => (
            <div key={sp.id} role="listitem" className="flex items-center gap-2.5 px-2.5 py-1 touch:py-1.5">
              <span className="w-7 h-7 touch:w-9 touch:h-9 shrink-0 rounded-[8px] bg-white flex items-center justify-center overflow-hidden">{sp.logo ? <img src={sp.logo} alt="" className="max-w-full max-h-full object-contain" /> : <Star size={13} className="text-zinc-500" />}</span>
              <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-zinc-100">{sp.name}</span>
              <button className="w-8 h-8 touch:w-11 touch:h-11 shrink-0 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-100" aria-label={`Put ${sp.name} on the page`} title="Put it on the page" onClick={() => addExtra({ kind: "sponsor", sponsorId: sp.id, w: 0.16, size: 16 })} data-testid="add-sponsor-piece"><Plus size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Picture for the page" data-testid="page-image-input" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (t === "map") return void addImage(f); const p = await pictureFrom(f); addExtra({ kind: "image", src: p.src, aspect: p.aspect }); }} />
    </div>
  );
}

/** Layers: everything on the page, to pick, hide or bring back. What isn't on the page shown says
 * why; a click on one that's on another hole goes to that hole's page, and on one with no words
 * to show, types them. */
export function Layers({ t }: { t: TargetKey }) {
  const doc = useCourse(c => c.doc);
  const sel = useEditor(e => e.designSel);
  const set = useEditor(e => e.set);
  // (what the page draws: known once it's drawn)
  useSyncExternalStore(onDrawn, drawnNow);
  const rows = layersOf(doc, t);
  const pick = (r: Layer) => {
    if (sel === r.id) return set({ designSel: null });
    if (r.hole) set({ designHole: r.hole });
    if (!r.shown) setLayerShown(t, r.id, true);
    set({ designSel: r.id });
    if (r.note && !r.hole && r.typable) askTyping(r.id);
  };
  return (
    <div className="rounded-[16px] bg-white/[0.05] py-1" role="list" aria-label="Layers" data-testid="layers">
      {rows.map(r => {
        const picked = sel === r.id, away = !!r.note && r.shown;
        return (
          <div key={r.id} role="listitem" className={`flex items-center gap-1 px-1.5 ${picked ? "bg-orange-400/15" : ""}`}>
            <button className={`flex-1 min-w-0 text-left px-1.5 py-1.5 touch:py-3 text-[13px] ${r.shown && !away ? "text-zinc-100" : "text-zinc-500"} ${picked ? "font-semibold" : ""} disabled:cursor-default`} disabled={away && !r.hole && !r.typable} title={r.note} onClick={() => pick(r)} data-testid="layer" data-layer={r.id}>
              <span className="block truncate">{r.label}{r.changed && <span className="ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-orange-400 align-middle" aria-label="Changed" />}</span>
              {r.note && <span className="block truncate text-[11px] text-zinc-500 font-normal">{r.note}{r.hole ? `: show hole ${holeLabel(doc, r.hole)}` : ""}</span>}
            </button>
            {r.fixed ? <span className="w-[26px] touch:w-[44px] shrink-0" /> : (
              <button className="p-1.5 touch:p-3 rounded hover:bg-white/[0.1] text-zinc-400" aria-label={r.shown ? `Hide ${r.label}` : `Show ${r.label}`} aria-pressed={r.shown} title={r.shown ? "Hide" : "Show"} onClick={() => setLayerShown(t, r.id, !r.shown)}>
                {r.shown ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Which holes something shows on: all of them, or the holes picked (the same row of hole chips
 * as everywhere holes are picked). */
export function HolePicker({ holes, onChange }: { holes?: string[]; onChange: (v: string[] | undefined) => void }) {
  return (
    <div className="mt-1">
      <HoleChips label="Holes it's on" picked={holes?.length ? holes : "all"} onChange={v => onChange(v === "all" || !v.length ? undefined : v)} />
    </div>
  );
}

/** What a sponsor has on the page: its logo, its line of text, both, or its name alone. */
const sponsorHas = (sp: Sponsor) => (sp.logo && sp.text ? "Logo and text" : sp.logo ? "Logo" : sp.text ? "Text" : "Name only");

/** The course's sponsors: a logo, a line of text, or both, on every hole or the holes picked. */
export function Sponsors() {
  const doc = useCourse(c => c.doc);
  const list = doc.style.sponsors ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const forLogo = useRef<string | null>(null);
  const put = (f: (xs: Sponsor[]) => Sponsor[], history = true) => changeDoc(d => ({ style: { ...d.style, sponsors: f(d.style.sponsors ?? []) } }), history);
  const patch = (id: string, p: Partial<Sponsor>, history = true) => put(xs => xs.map(x => (x.id === id ? { ...x, ...p } : x)), history);
  // (typed: one undo step once the field is left)
  const typed = () => useCourse.getState().commit();
  const add = () => { const id = generateId(); put(xs => [...xs, { id, name: `Sponsor ${xs.length + 1}` }]); setOpen(id); };
  return (
    <div data-testid="sponsors">
      <div className="flex flex-col gap-1.5">
        {list.map(sp => (
          <div key={sp.id} className="rounded-[14px] bg-white/[0.05]">
            <button className="w-full flex items-center gap-2.5 px-2.5 py-2 touch:py-3 text-left" aria-expanded={open === sp.id} onClick={() => setOpen(open === sp.id ? null : sp.id)}>
              <span className="w-9 h-9 shrink-0 rounded-[10px] bg-white flex items-center justify-center overflow-hidden">{sp.logo ? <img src={sp.logo} alt="" className="max-w-full max-h-full object-contain" /> : <Star size={15} className="text-zinc-500" />}</span>
              <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold text-zinc-100 truncate">{sp.name}</span><span className="block text-[11.5px] text-zinc-400">{sponsorHas(sp)} · {sp.holes?.length ? `Holes ${byNumber(doc.holes).filter(h => sp.holes!.includes(h.id)).map(h => holeLabel(doc, h.id)).join(", ")}` : "Every hole"}</span></span>
              <ChevronRight size={15} className={`text-zinc-500 transition-transform ${open === sp.id ? "rotate-90" : ""}`} />
            </button>
            {open === sp.id && (
              <div className="px-2.5 pb-2.5">
                <Field label="Name"><TextInput label="Sponsor name" value={sp.name} onChange={v => patch(sp.id, { name: v }, false)} onDone={typed} /></Field>
                <Field label="Text on the page"><TextInput label="Text on the page" value={sp.text ?? ""} onChange={v => patch(sp.id, { text: v || undefined }, false)} onDone={typed} placeholder={sp.logo ? "None (the logo alone)" : sp.name} /></Field>
                <div className="flex gap-2 my-1.5">
                  <button className="text-xs font-semibold text-orange-300 hover:text-orange-200 touch:min-h-11" onClick={() => { forLogo.current = sp.id; file.current?.click(); }}>{sp.logo ? "Another logo" : "Add a logo"}</button>
                  {sp.logo && <button className="text-xs text-zinc-400 hover:text-zinc-200 touch:min-h-11" onClick={() => patch(sp.id, { logo: undefined, aspect: undefined })}>No logo</button>}
                </div>
                <Field label="Holes"><HolePicker holes={sp.holes} onChange={v => patch(sp.id, { holes: v })} /></Field>
                <button className="mt-2 text-xs text-red-300 hover:text-red-200 flex items-center gap-1 touch:min-h-11" onClick={() => { removeSponsor(sp.id); setOpen(null); }}><Trash2 size={12} /> Remove {sp.name}</button>
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

/** The panel for printout `t`: what it starts from (`top`), Add, Layers, and its other settings
 * (`children`). */
export function PrintPanel({ t, top, children }: { t: TargetKey; top?: React.ReactNode; children?: React.ReactNode }) {
  const doc = useCourse(c => c.doc);
  return (
    <>
      {top}
      <Section title="Add" testid="print-add" help="printout-editing">
        <AddPieces t={t} />
      </Section>
      <Section title={<span className="flex items-center gap-1.5"><ListTree size={14} /> Layers</span>} testid="print-layers" help="printout-editing">
        <Layers t={t} />
        {t === "map" && Object.values(doc.style.labelAt ?? {}).some(o => o.hidden) && (
          <button className="mt-2 text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => changeDoc(d => ({ style: { ...d.style, labelAt: Object.fromEntries(Object.entries(d.style.labelAt ?? {}).map(([k, o]) => [k, { ...o, hidden: undefined }])) } }))} data-testid="page-show-labels"><Eye size={12} /> Show the hidden labels on the map ({Object.values(doc.style.labelAt ?? {}).filter(o => o.hidden).length})</button>
        )}
      </Section>
      {children}
    </>
  );
}

/** Where changes to a sign or page go: every hole's, or the hole shown's alone. */
export function ChangeScope() {
  const doc = useCourse(c => c.doc);
  const scope = useEditor(e => e.signScope);
  const designHole = useEditor(e => e.designHole);
  const active = useEditor(e => e.activeHoleId);
  const holeId = [designHole, active].find(id => id && doc.holes.some(h => h.id === id)) ?? doc.holes[0]?.id ?? null;
  if (!holeId) return null;
  return (
    <Field label="Changes go to">
      <div data-testid="change-scope">
        <Segmented label="Changes go to" value={scope} onChange={v => useEditor.getState().set({ signScope: v })} options={[{ value: "all", label: "Every hole" }, { value: "hole", label: `Hole ${holeLabel(doc, holeId)} only` }]} />
      </div>
    </Field>
  );
}

/** The holes with a sign (or page) of their own, to put back to every hole's: shown only while
 * there are some. */
export function OwnHoles({ t }: { t: "sign" | "page" }) {
  const doc = useCourse(c => c.doc);
  const own = holesWithOwn(doc, t);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[] | "all">("all");
  if (!own.length) return null;
  const holes = byNumber(doc.holes).filter(h => own.includes(h.id));
  const close = () => { setOpen(false); setPicked("all"); };
  const ids = picked === "all" ? own : picked;
  return (
    <div className="mt-2" data-testid={t === "sign" ? "sign-own" : "page-own"}>
      <Button small onClick={() => (open ? close() : setOpen(true))}>{t === "sign" ? "Holes with their own sign" : "Holes with their own page"} ({own.length})…</Button>
      {open && (
        <div role="dialog" aria-label="Put holes back" className="mt-1.5 rounded-lg border border-white/[0.12] glass p-2">
          <HoleChips label="Holes to put back" holes={holes} picked={picked} onChange={setPicked} />
          <div className="flex gap-2 mt-2">
            <Button small tone="primary" disabled={!ids.length} onClick={() => { putBack(t, ids); close(); }}>{t === "sign" ? "Back to every hole's sign" : "Back to every hole's page"}</Button>
            <Button small tone="ghost" onClick={close}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The hole page's look, and one hole's own page given to others. */
export function HolePageLook() {
  const doc = useCourse(c => c.doc);
  const look = doc.style.holePage?.look ?? "standard";
  const designHole = useEditor(e => e.designHole);
  const active = useEditor(e => e.activeHoleId);
  const scope = useEditor(e => e.signScope);
  const holeId = [designHole, active].find(id => id && doc.holes.some(h => h.id === id)) ?? doc.holes[0]?.id ?? null;
  const forHole = scope === "hole" && !!holeId;
  // (from a hole: its own page to the holes picked)
  const applyTo = (ids: string[]) => changeDoc(d => {
    const from = d.holes.find(h => h.id === holeId)?.page;
    return { holes: d.holes.map(h => (ids.includes(h.id) ? { ...h, page: from ? JSON.parse(JSON.stringify(from)) : undefined } : h)) };
  });
  return (
    <Section title="Hole pages" testid="page-settings" help="hole-pages">
      <ChangeScope />
      <Field label="Start from">
        {/* (another look starts every page over, each hole's own changes too) */}
        <Segmented label="Hole page look" value={look} onChange={v => changeDoc(d => ({ style: { ...d.style, holePage: { ...d.style.holePage, look: v === "standard" ? undefined : v, layout: undefined } }, holes: d.holes.map(h => (h.page ? { ...h, page: undefined } : h)) }))} options={HOLE_PAGE_LOOKS.map(l => ({ value: l.id, label: l.label }))} />
      </Field>
      {forHole && doc.holes.length > 1 && <ApplyToHoles fromId={holeId!} apply={applyTo} testid="page-apply" />}
      <OwnHoles t="page" />
    </Section>
  );
}

/** The course's logo: a picture picked from the device, made small (at most 320 px across) so the
 * course file stays light. */
function LogoPicker({ logo }: { logo?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const set = (v?: string) => changeDoc(d => ({ style: { ...d.style, logo: v } }));
  const pick = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const k = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      set(c.toDataURL("image/png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {logo && <img src={logo} alt="Course logo" className="h-9 max-w-[120px] object-contain rounded bg-white/90 p-0.5" data-testid="logo-preview" />}
      <input ref={input} type="file" accept="image/*" className="hidden" aria-label="Course logo file" data-testid="logo-input" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      <Button small onClick={() => input.current?.click()}>{logo ? "Change" : "Upload"}</Button>
      {logo && <Button small onClick={() => set(undefined)}>Remove</Button>}
    </div>
  );
}

/** The scorecard's own settings: its logo, and how many players it has rows for. */
export function ScorecardSettings() {
  const doc = useCourse(c => c.doc);
  const players = doc.style.scorecard?.players ?? 5;
  return (
    <Section title="Scorecard" testid="card-settings" help="scorecard">
      <Field label="Logo">
        <LogoPicker logo={doc.style.logo} />
      </Field>
      <Slider label="Rows for players" min={2} max={8} step={1} value={players} onChange={v => changeDoc(d => ({ style: { ...d.style, scorecard: { ...d.style.scorecard, players: v } } }), false)} onDone={() => useCourse.getState().commit()} format={v => `${v}`} />
    </Section>
  );
}
