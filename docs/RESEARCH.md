# Research: what other course design tools do, and what this one should do

Searched in October 2026. The facts come from search-result summaries of the pages linked below.
Check the PDGA numbers against the live pages before relying on them for a sanctioned course.

## Disc golf tools today

| Tool | What it does well | What it lacks |
| --- | --- | --- |
| **UDisc** ([Map Manager](https://help.udisc.com/en/articles/10524104-map-your-course), [tee and target positions](https://help.udisc.com/en/articles/10808993-managing-tee-and-target-positions)) | The players' app. Every tee and target position is placed by tapping the map or by GPS. "Smart Layouts" pick a tee and a target for each hole, with doglegs, par and hole notes. You can upload tee sign images (PNG/JPEG under 5 MB). | OB, mandos, hazards and drop zones are written in hole notes, not drawn ([forum](https://forum.udisc.com/t/ob-lines-and-hazards/216)). No elevation. No file import. |
| **Parkdly** ([parkdly.com](https://parkdly.com)) | A browser designer on a satellite background. It draws OB, mandos, landing zones, fairway widths and C1/C2 circles, suggests par, and exports print-ready signs, maps and caddie books from the same data. | 2D only. No real terrain. |
| **DiscMap** ([discmap.app](https://discmap.app/disc-golf-course-design-software)) | Free. Paths, woods and water come from OpenStreetMap. Click a tee and then a basket and the fairway draws itself; drag points to make doglegs. Exports vector PDF signs (A4/Letter), an 18x24 in info board and a caddie book. | No elevation. No GPS export. |
| Upsi, Radius, DiscScout, Discin Maps | Map a course by walking it, a 3D aerial view, elevation data, sign images. | Each covers one piece. |
| Google Earth / QGIS (DIY) | Paths and elevation profiles; LiDAR in QGIS for printed maps. | Slow, expert-only, and Google elevation is poor in places. |

**Gap:** no tool combines real terrain and 3D, elevation-adjusted distances, safety checks between
holes, and both print and GPS output. That is what this app is for.

**What a course designer hands over** ([Innova](https://www.innovadiscs.com/course-development/),
[PDGA FAQ](https://www.pdga.com/faq-page/33), [ASGCA construction documents](https://asgca.org/design/new-courses/construction-documents/)):

- a course map and hole-by-hole maps with par;
- tee and target positions staked out, and trees to remove;
- a parts list: baskets, 2 to 3 spare sleeves per hole, tee pads, signs, benches, a kiosk;
- costs of roughly $350 to $1,000 per hole.

## Regular golf tools (ideas to borrow)

- **PGA Tour 2K Course Designer and The Golf Club:**
  - sculpting terrain, and splines for water and fairways;
  - painted surfaces;
  - routing rules: each hole ends near the next tee, and the course starts and finishes near the clubhouse.
- **Golf architects' construction drawings:**
  - a strategy plan;
  - a staking and layout plan;
  - clearing limits;
  - grading.
- **Yardage books (StrackaLine):**
  - tee-to-green distance, elevation change and carries;
  - slope arrows;
  - distance rings and a compass on every hole.
- **Map styles:**
  - illustrated aerials with painted trees and shadows;
  - multi-directional hillshade;
  - contour maps;
  - flat vector scorecard art.

## Disc golf standards the app follows

**Skill levels** ([PDGA](https://www.pdga.com/course-development/skill-level-guidelines)). Tee colors
match player ratings:

- Gold: 970+
- Blue: 925+
- White: 875+
- Red: 825+
- Green: under 825

**Par** ([PDGA Par Guidelines](https://www.pdga.com/documents/par-guidelines)):

- Effective length = measured length (along the intended route) + 3 × (basket elevation − tee elevation).
- Doglegs and heavy foliage make a hole play longer.
- Minimum effective length for each par:

| Par | Gold | Blue | White | Red | Green |
| --- | --- | --- | --- | --- | --- |
| 3 | 250 ft | 200 ft | 160 ft | 140 ft | 100 ft |
| 4 | 625 ft | 525 ft | 450 ft | 375 ft | 325 ft |
| 5 | 1000 ft | 800 ft | 675 ft | 550 ft | 475 ft |

**Typical 18-hole totals:**

- Gold: 7,000–11,000 ft
- Blue: 5,000–8,500 ft
- White: 4,500–7,500 ft
- Red: 3,500–5,500 ft
- Green: 2,500–4,000 ft

No hole should play shorter than about 100 ft.

**Tees** ([PDGA design elements](https://www.pdga.com/course-development/design-elements)):

- at least 4 x 10 ft;
- usually 5 x 12 ft, or 6 x 13 ft at long tees;
- a 2 ft apron all round;
- nothing in the way within 20 ft in front of the tee.

**Fairways** in the woods are 15 ft at pinch points up to 40 ft wide.

**Safety.** The PDGA gives no number for safety distances. Its rules are:

- fairways must not cross;
- keep holes away from roads, paths, playgrounds, pavilions and private land;
- avoid blind throws toward paths;
- stray throws should not regularly land in another fairway.

The app therefore checks against a distance you can change (it starts at the larger of 50 ft or
15% of the hole's length).

**Water.** The shortest tee should not have to throw over water normally deeper than 18 in.

**Course flow:**

- the first tee and the last basket go near parking;
- walks should be short;
- never walk back through a fairway that is in play.

**Markings** ([PDGA Competition Manual 4.08](https://www.pdga.com/rules/competition-manual/408)):

- OB: white
- Casual relief: blue
- Relief areas: red
- Hazards: yellow
- Drop zones and mandos: orange

On printed maps OB is usually shown red, which is what this app does.

**Signs.** At minimum a hole number and the length(s). Usually also:

- par;
- the distance from each tee;
- a hole map with the flight, OB, hazards, trees and mandos;
- the pin positions;
- hole rules;
- an arrow to the next tee.

The most common size is 12x18 in.

## Exports that make sense

- **Course map / info board** (18x24 in, Tabloid, Letter, A3, A4): PDF, PNG and SVG.
- **Tee signs**, one per hole, 12x18 in: PDF, plus PNG images under 5 MB that can be uploaded to UDisc.
- **Scorecard**: par and distance for each tee color, with front 9 and back 9 totals.
- **Caddie book**: one page per hole with the map, distances, elevation profile and notes.
- **GPS files:**
  - KML for Google Earth;
  - GeoJSON;
  - GPX waypoints for staking out positions with a phone;
  - a CSV of holes (tee and basket coordinates, lengths, elevation, par).

  UDisc has no file import, so course ambassadors and sign makers use these as a reference.
- **Construction package:**
  - a stake-out list (coordinates, plus bearing and distance from tee to basket);
  - the parts list with concrete volume (a 4 in slab: 5x12 ft is about 0.74 cu yd);
  - a cost estimate.

## What this app does, by priority

1. Several tees (by color) and pins (A/B/C) per hole, and layouts that pick one of each.
2. A throw line with doglegs. Length and elevation change are measured on the real terrain, live.
3. Effective length and par worked out the PDGA way.
4. OB lines and areas, hazards, water, mandos (with direction) and drop zones, all drawn on the map.
5. Exports: printable map, tee signs, scorecard, caddie book, GPS files and CSV.
6. Checks:
   - safety between holes, and near roads, paths and no-go areas;
   - trees in the line and in front of the tee;
   - tee pad size;
   - walking distance and course flow;
   - course length against the PDGA ranges.
7. A view from the tee and a flyover of each hole in 3D, with an elevation profile per hole.
8. Map styles: illustrated, satellite, topographic, minimal and night; contours and hillshade;
   trees with shadows; a title block, legend, hole table, north arrow and scale bar.
9. A share link that carries the whole design.

## Phones and tablets: research and design

Searched in October 2026, from search-result summaries (most design pages and image hosts could
not be opened from here). What the best map apps do on a phone, and the guidance behind them:

- **Google Maps** keeps the map as the screen and puts everything else in a bottom sheet that
  peeks, opens to half height for details, and drags to full height. Since its 2025 redesign even
  the full-height sheet leaves a strip of map showing, and tapping a place opens its sheet over
  the map ([9to5Google](https://9to5google.com/2025/01/21/google-maps-redesign-sheets/),
  [Android Authority](https://www.androidauthority.com/google-maps-sheets-3548003/)).
- **Apple Maps** moved search and results from the top bar into a card at the bottom that swipes
  up ([MacStories](https://macstories.net/stories/ios-10-the-macstories-review/18)). Apple's sheets
  rest at medium and large heights ("detents"), may be non-modal so the map behind stays usable,
  and show a grabber that VoiceOver users activate to step through the heights
  ([WWDC21 "Customize and resize sheets"](https://developer.apple.com/wwdc21/10063)).
- **AllTrails** pairs a swipe with a visible map button: the gesture for regulars, the button so
  new users find it ([design critique](https://ixd.prattsi.org/2025/02/design-critique-alltrails-ios-app-2/)).
- **Strava's route builder** places points by tapping, with Undo in the lower right; drawing is a
  separate mode whose undo removes the whole stroke; people complain when undo is coarse
  ([Strava help](https://support.strava.com/hc/en-us/articles/18001474720397-Creating-Routes-on-Mobile),
  [TrainerRoad forum](https://www.trainerroad.com/forum/t/tweaking-a-planned-route-in-strava/38823)).
- **UDisc** (the players' app): swipe on the bottom panel for the next hole, hold a finger on the
  map to add a throw, buttons to zoom to the circle ([UDisc help](https://help.udisc.com/en/articles/10705067-map-scoring)).
- **Felt** keeps phones for viewing and field work and sends editing to a tablet or computer
  ([Felt help](https://help.felt.com/field-app/tour-the-field-app)). This app goes further: the
  whole course can be laid out on a phone.
- **Reach:** in Steven Hoober's observations 49% of people hold a phone in one hand, 36% cradle
  it, 15% use two hands ([A List Apart](https://alistapart.com/1-8-phablet-choke-2x-jpg/)); he
  also warns the "thumb zone" is not a rigid rule. So: the most used controls along the bottom,
  big enough for any grip.
- **Targets:** WCAG 2.2 asks for at least 24 × 24 CSS px (2.5.8), and 44 × 44 for the enhanced
  level; Apple says 44 pt, Material 48 dp ([summary](https://www.disabilityworld.org/toolkit/glossary/touch-target-size/)).
- **Gestures:** WCAG 2.5.1 needs a single-pointer way for every pinch or two-finger gesture,
  such as zoom buttons, and the alternative should not rely on dragging alone (2.5.7)
  ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures)). A long-press is hard to
  discover, so it should only be a shortcut for something also on a visible button
  ([GNOME Maps](https://gitlab.gnome.org/GNOME/gnome-maps/issues/2)).
- **Dialogs and sheets:** focus moves into a dialog when it opens and back when it closes; a
  draggable sheet must also work from the keyboard ([MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/dialog_role)).
- **The screen's edges:** `viewport-fit=cover` with `env(safe-area-inset-*)` padding keeps bars
  clear of the notch and home indicator, and `dvh` units follow the browser's own bars
  ([safe area insets](https://mohammadshehadeh.com/css/safe-area-insets/)).

**What the app does with it** (below 768 px wide; the desktop layout is unchanged):

1. **The map is the screen.** A slim floating top bar (name, 2D/3D, share, menu) and the map's
   buttons (compass, zoom, whole course, turn; light in 3D), all 44 px, are the only things over it.
2. **The six steps in a bar at the bottom**, icons with labels. Six is one more than the usual
   bottom bar, but they are one ordered workflow and each is still 65 px wide on a 390 px phone.
   Tapping the open step shows more or less of its panel.
3. **One bottom sheet** for the step's panel, the selection, or the active tool, resting at peek
   (its header), half and full height (a strip of map always stays). Drag it, flick it, drag the
   list when it is at the top, tap the grabber to step through the heights (as on iOS), or use
   the arrow keys on it. Picking a tool lowers it; picking something from a full list brings it
   to half height so the map shows it, and the map fits holes above it.
4. **Tools in a labelled row** at the top of the sheet (Select, Hole, Tee, Pin, Mando…), with
   Undo and Redo always at its end. The active tool's hint and choices (tee colors, kinds of
   area) sit right under it, in words for fingers ("Tap the corners, then Done").
5. **Drawing by taps:** Undo, Cancel and Done float over the map while a shape is drawn (there is
   no Enter, Backspace or Esc on a phone), with the point count on Done. Rectangles, circles and
   freehand shapes are dragged out with one finger; two fingers still move the map and never
   place anything.
6. **Long-press = right-click:** holding a finger on a hole or a thing opens its menu as an action
   sheet from the bottom (view from the tee, fly over, mark OB, play earlier or later, duplicate,
   lock, delete). The same menu is on the selection's "More" button, so nothing depends on the
   hidden gesture.
7. **The selection takes over the sheet** with a back arrow to the step, and Delete, View from
   the tee and More in reach.
8. **On its side** (a short, wide screen) and on a tablet held upright, the steps move to a rail
   on the left with the panel beside it (Material's navigation rail for medium widths); tablets on
   their side keep the desktop layout.
9. **Dialogs become sheets from the bottom;** finding the park is full screen with the search on
   top and "Bring in this site" at the bottom. The Design preview fits the page to the screen's
   width, pinches to zoom, and keeps its zoom buttons floating within reach. The view from a tee
   puts the hole's card on top and big buttons along the bottom.
10. **Readable and reachable:** small print is bumped up on touch screens, text fields use 16 px
    (phones zoom into smaller ones), handles on the map get bigger invisible hit areas, and a tap
    may wobble 10 px before it counts as a drag.

### Mobile performance

The owner asked that it "works performance perfectly" on phones. What the guidance says, and what
the app does:

- **Animate only transform and opacity**; they run on the compositor without layout or paint
  ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)).
  The sheet is always full height and slides with `translate3d`; while a finger drags it the
  position is written to the element once per animation frame, with no React render. The list
  inside is resized once when the sheet comes to rest.
- **No frosted glass over the map.** A backdrop blur is redrawn behind each panel whenever the
  map draws a frame, and blur cost is known to hurt on phone GPUs
  ([OpenReplay](https://blog.openreplay.com/creating-blurred-backgrounds-css-backdrop-filter/)).
  On touch screens the panels over the map are solid or slightly see-through instead.
- **Keep taps instant:** `touch-action: manipulation` on the app (no double-tap-zoom wait),
  `touch-action: none` on the map (the map's own gestures, no page zoom), non-passive touch
  listeners only where a drag must be taken over. The goal is the "good" Interaction to Next Paint
  of 200 ms or less ([web.dev](https://web.dev/articles/inp)).
- **No needless map frames:** UI changes don't redraw the 3D map (a step change used to clear an
  empty drawing, which redrew it).
- **The keyboard:** Chrome on Android and Safari resize only the visual viewport when the
  keyboard opens ([Chrome](https://developer.chrome.com/blog/viewport-resize-behavior)); the
  sheet goes to full height when a field takes the focus and makes room under the list, so the
  layout does not jump.

**Measured** (Playwright, Chromium's iPhone 13 profile, CPU slowed 4× through the DevTools
protocol, an imported site with 18 holes; medians of 3 rounds; "before" is the app before the
phone layout, on the same phone profile). Interaction = the slowest event of the tap or drag
(Event Timing, what INP reports; "under 16" means no event took 16 ms):

| | Before | After |
| --- | --- | --- |
| Tap a hole in the list: interaction | 312 ms | under 16 ms |
| Tap a tool: interaction | 232 ms | 32 ms |
| Tap the sheet's handle: interaction, map frames | (no sheet) | 24 ms, 0 |
| Drag the sheet (30 moves): interaction, long tasks, layouts, map frames | (no sheet) | 40 ms, 0, 1–2, 0 |
| Slide the sheet 30 frames by height vs by transform: layouts | | 31 vs 0 |
| One 3D map frame (software rendering in the test machine) | ~170 ms on a 100 × 1216 px canvas | ~580 ms on a 780 × 1202 px canvas |

The taps and the sheet are now well inside the 200 ms "good" mark. What is left is the 3D map's
own frame time: the phone layout gives the map the whole screen (before, the side panel squeezed
it to a sliver 50 px wide, which is why its frames were cheaper). The test machine renders WebGL
in software, so real phone GPUs are much faster, but the map's frame cost on phones (pixel ratio,
shadow map size, grass and tree detail) is handled in the map engine's quality settings, not in
the interface.
