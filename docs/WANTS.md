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
