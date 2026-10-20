# What the owner asked for

The owner's requests, kept here so none get lost. Every item is checked off only after it has
been seen working in the browser.

## The original request

- [ ] **Built from the Security Camera Planner's core engine**
  (https://github.com/Sulphuric6297/Security-Camera-Planner): the same map import, satellite
  imagery, elevation data and one 2D/3D map view, turned into a **disc golf course designer**.
- [ ] **Research first**: look at other disc golf (and regular golf) course design software and
  use that research to design a really great disc golf course designer
  (findings: `docs/RESEARCH.md`).
- [ ] **Course parts you can add**: fairways, OB (out of bounds), baskets, tees, and
  "everything else you can think of" (mandos, drop zones, hazards, alternate pin positions,
  multiple tees per hole, walking paths, signs, benches, parking and so on).
- [ ] **Elevation data, like the camera planner**: real terrain for the site, with elevation
  change shown for each hole.
- [ ] **A robust designer to make the map really beautiful**: map styles, colors, labels,
  hole numbers, legend, title block, north arrow, scale bar, contours, trees and so on.
- [ ] **Exportable in a way that makes sense**: for example a printable course map, tee signs,
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
- [ ] **Mandos, OB, hazards and everything else**, rendered perfectly on the map and really easy
  to lay out.
- [ ] **Tee signs like the owner's second example** (a wide sign on a post):
  - a light column on the left with the course name, the hole number big in a dark box, a PAR
    tag in the tee color, the distance in big type ("305 FEET") and the hole notes;
  - the hole map on the right in the same painted-woods style, tee at the bottom;
  - the elevation change from the tee along the bottom.

## Second round (the owner's feedback on the maps)

- [ ] **Beautiful, aesthetically pleasing maps are the one real requirement.** The maps must
  replicate the owner's reference course's painted maps in every way (looked up online):
  - really dark, speckled trees contrasted with the grass;
  - darker water colors;
  - earth tones, less bright tones.
- [ ] **Shadows and light are settings** that can be changed.
- [ ] **Good for visualizing in 3D**, planning a course, and creating beautiful maps.
- [ ] **Renders look really great, not cheesy 3D**; the 3D view is a true perspective.
- [ ] **Grass is rendered as blades of grass in 3D**, from short greens up to tall grass.
- [ ] **Any type of terrain** is handled.
- [ ] **Placing individual trees** is an option.
- [ ] **Buildings, bridges and any other infrastructure** are available.
- [ ] **Industry-standard symbols**, after researching what official disc golf maps use.
- [ ] **Record and export flyovers** (video); a robust export system.
- [ ] **Per-hole exports**, not just the whole map.

