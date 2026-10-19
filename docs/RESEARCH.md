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
