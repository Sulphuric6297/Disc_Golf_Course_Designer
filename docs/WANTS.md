# What the owner asked for

The owner's requests, kept here so none get lost. Every item is checked off only after it has
been seen working in the browser.

## The original request

- [x] **Built from the Security Camera Planner's core engine**
  (https://github.com/Sulphuric6297/Security-Camera-Planner): the same map import, satellite
  imagery, elevation data and one 2D/3D map view, turned into a **disc golf course designer**.
- [x] **Research first**: look at other disc golf (and regular golf) course design software and
  use that research to design a really great disc golf course designer
  (findings: `docs/RESEARCH.md`).
- [x] **Course parts you can add**: fairways, OB (out of bounds), baskets, tees, and
  "everything else you can think of" (mandos, drop zones, hazards, alternate pin positions,
  multiple tees per hole, walking paths, signs, benches, parking and so on).
- [x] **Elevation data, like the camera planner**: real terrain for the site, with elevation
  change shown for each hole.
- [x] **A robust designer to make the map really beautiful**: map styles, colors, labels,
  hole numbers, legend, title block, north arrow, scale bar, contours, trees and so on.
- [x] **Exportable in a way that makes sense**: for example a printable course map, tee signs,
  a scorecard, GPS files (GeoJSON / KML / GPX) and a hole list (CSV).

## Added while the work was under way

- [ ] **Hosted on GitHub**: a static site on GitHub Pages, like the camera planner. No backend
  and no API keys.
- [ ] **A share link for a course**: send a link that opens the course for anyone (view it,
  and make their own copy to edit). With no server, the course goes inside the link and the
  map and elevation load again for that location.
- [ ] **Course maps that look like professionally painted course maps** (the owner's example:
  a course map from UDisc). What that look is made of:
  - dense, lush painted woods, with the fairways cut through as bright mown clearings;
  - single trees standing in the fairways;
  - blue creeks winding through the woods, and dirt and gravel paths;
  - small tee pads in their colors (gold, white…), small white basket marks, and bold white
    italic hole numbers;
  - the course name in a big brush-script title laid over the map;
  - a chip for each layout with its par and length ("GOLD LAYOUT · PAR 64 | 7,670'");
  - a full-bleed map, with no frame around it.
- [ ] **The painted look, mimicked closely: water, dirt and trees** (the owner's photo of a
  painted course map on a park sign; everything but the font):
  - woods as a fine, irregular texture of small treetops of many sizes (not round blobs, and
    nothing regular or "mathematical"-looking), dark with sunlit yellow-green flecks, with shadows
    falling onto the fairways and a dark rim where the woods meet them;
  - bright fairways with lighter middles, widening around tees and baskets, and lone trees
    standing in them;
  - brown dirt trails winding from each basket to the next tee, and worn dirt at the tees;
  - a bright blue creek winding through the woods with dark banks, partly under the trees;
  - soft gray roads; small tee pads in their colors; small dark basket marks.
- [x] **Trees can be sparse too**: a setting from a few scattered trees to solid woods.
- [x] **Better basket ("pin") pictures, with several to choose from.**
- [x] **Mandos, OB, hazards and everything else**, rendered perfectly on the map and really easy
  to lay out.
- [x] **Tee signs like the owner's second example** (a wide sign on a post):
  - a light column on the left with the course name, the hole number big in a dark box, a PAR
    tag in the tee color, the distance in big type ("305 FEET") and the hole notes;
  - the hole map on the right in the same painted-woods style, tee at the bottom;
  - the elevation change from the tee along the bottom.

## Second round (the owner's feedback on the maps)

- [ ] **Beautiful, aesthetically pleasing maps are the one real requirement.** The maps must
  replicate the owner's reference course's painted maps in every way (looked up online):
  - really dark, speckled trees contrasted with the grass;
  - darker water colors;
  - earth tones, less bright tones;
  - trees like the reference sign maker's other course maps: crisp, sponge-dabbed leaf clumps
    with pale sunlit tops and near-black gaps, and a shade band where the woods meet the grass.
- [x] **Shadows and light are settings** that can be changed (the painted map's Light and
  shadow section, and the 3D view's Light and grass panel share one sun).
- [ ] **Good for visualizing in 3D**, planning a course, and creating beautiful maps.
- [ ] **Renders look really great, not cheesy 3D**; the 3D view is a true perspective.
- [x] **Grass is rendered as blades of grass in 3D**, from short greens up to tall grass
  (mown fairways, longer grass between holes, knee-high in the rough).
- [x] **Any type of terrain** is handled: landscapes (wooded park, open park, pine forest, dry
  grass, autumn, desert) for the painted map and 3D, and relief shading that suits gentle or
  steep ground.
- [x] **Placing individual trees** is an option (the Tree tool: leafy, pine, palm, bush).
- [x] **Buildings, bridges and any other infrastructure** are available: bridges, boardwalks,
  stairs, walls, buildings, shelters and decks, in 3D and on every map style.
- [x] **Industry-standard symbols**, after researching what official disc golf maps use: the
  PDGA's marking colors (white OB, yellow hazard, blue casual, red out of play) or the common
  map colors, with legend lines that say what each means for play.
- [x] **A record option to export flyovers** as video files (seen as WebM; MP4 needs a browser
  with H.264 encoding, not available in the test browser):
  - one hole, or the whole course in order, at 720p, 1080p, 1440p or 4K, 30 or 60 fps;
  - smooth however slow the computer (made frame by frame, not filmed off the screen), as an MP4
    where the browser can make one (WebM otherwise);
  - the hole's number, par and length on screen, and the basket marked with the distance left;
  - a Record button in the Export step (with progress and Cancel) and over the flyover itself.
- [x] **Per-hole exports too, not just the whole map**:
  - a page per hole like a yardage book or a hole map in a scoring app: the hole's map with the
    tee at the bottom, number, par, the length from each tee color, elevation change and "plays
    like", the hole notes and a small elevation profile;
  - Letter, A4, a 4 × 6 in card, or a square 1080 px picture for sharing;
  - all holes as one PDF or a ZIP of pictures; one hole as PDF, PNG, SVG or its own GeoJSON.

## Third round

- [ ] **Don't just follow the owner's directions**: look up how to actually make it look good,
  research whether it's possible, and only build what makes it look great — something anyone
  would love to look at.
- [x] **Elevation is translated well on 2D maps**: hills read through the painted woods (lit and
  shaded sides, Swiss-style warm and cool), illuminated contour lines painted on the open ground,
  contour heights on the drawn styles, relief exaggerated to suit the course.
- [x] **Fairways can be widened**: all along, or in places (a wide landing zone, a pinched gap)
  with the width squares along the hole.
- [ ] **Mobile friendly**, as a well thought out mobile navigation platform (not a strap-on),
  while working just as well on desktop: see "Phones and tablets" below.
- [x] **A half wooded, half open course looks good either way** (tested on purpose: the painted
  map with drawn woods only, with woods everywhere, in 3D and from a tee; 3D woods now keep off
  the fairways and the pond).
- [x] **Water looks better, not plain**: painted ponds with light shallows, a bright rim, faint
  water lines and a deep middle; 3D water mirroring the sky and the treeline, with small waves.
- [ ] **Mobile performs perfectly** (researched): the engine side is done and measured (never
  freezes while the map paints, lighter 3D on phones, quality that adapts within seconds however
  slow the phone, the hidden map view rests, nothing drawn while the map sits still, a flyover
  recording never waits on the screen's breeze); the phone layout's own (the sheet on the GPU, no frosted glass, taps answered in
  under 50 ms) is in "Phones and tablets" below. Still to check on a real phone.

## Phones and tablets

- [ ] **Mobile friendly, "not a strap-on feature but a well thought out mobile navigation
  platform", and just as good on desktop.** Researched first (`docs/RESEARCH.md`, "Phones and
  tablets"). Seen in Chromium's phone and tablet emulation; still to check on a real phone:
  - the map is the screen; the six steps in a bar at the bottom (a rail on the left with the
    phone on its side); the desktop layout unchanged, tablets keep the side panel;
  - the step's panel and the selection in a bottom sheet that rests at peek, half and full
    height (drag, flick, tap its handle, arrow keys), never hiding the whole map;
  - tools in a labelled row at the top of the sheet; drawing by taps with Undo, Cancel and Done;
    holding a finger on a thing opens its menu; pinch, two-finger turns and the 44 px map buttons;
  - the Design preview fitted to the screen (pinch or + and −), the tee view laid out for an
    upright phone, dialogs as sheets from the bottom, readable text;
  - "make sure mobile works performance perfectly": the sheet slides on the GPU, no frosted
    glass over the map, measured on a throttled phone profile (`docs/RESEARCH.md`).
