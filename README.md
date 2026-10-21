# Disc Golf Course Designer

Design a disc golf course on your park's real satellite photo and elevation, see it in 3D and
from every tee, then print beautiful course maps, tee signs and scorecards, and export GPS files. It runs entirely in the browser: a static site with no accounts, no server
and no API keys.

## What it does

**Your site**
- Search for a park or address and frame the area the course will use.
- The satellite photo and the elevation come in (USGS 3DEP lidar in the US, global terrain
  elsewhere), along with the trees found on the photo.
- Paths, creeks, ponds, roads, parking and buildings come in from OpenStreetMap.
- No site yet? Design on open ground.

**Holes**
- Click a tee spot, then a basket spot.
- Bend the throw line with doglegs and set the fairway's width.
- Add more tees (Gold, Blue, White, Red, Green) and more pin positions (A to D). Layouts pick a
  tee and a pin for each hole.
- Length, elevation change and par update live on the terrain. Par uses the PDGA method:
  effective length = length + 3 × climb, plus doglegs and foliage.

**Features**
- OB areas and OB lines, hazards, water and creeks, woods, no-go areas: click the corners, or
  drag out a rectangle, a circle or a freehand shape.
- One click adds OB along either side of a hole, or behind its basket. Water, creeks, roads,
  fences and paths can be marked OB (a red edge on the map, and counted in the hole numbers).
- Mandos (placed beside the hole's line, they face down it and are passed on the line's side),
  drop zones, trees.
- Paths, roads, fences, the route to the next tee.
- Benches, trash cans, tee signs, the kiosk, restrooms, parking, drinking water, a practice
  basket, shelters, bridges, first aid, picnic tables and "You are here", each with its own
  pictogram on the map.

**Review**
- Course totals: par, length, walking and climb.
- An elevation profile for each hole.
- Safety checks: crossing throw lines, holes too close together, tees and baskets in another
  hole's line, throws across roads and paths or over parking and no-go areas.
- PDGA design checks: tee pad size, trees in front of tees, minimum hole length, water carries
  from the shortest tee, course length, starting and finishing near parking.

**3D**
- The whole course in 3D: tee pads, baskets, signs and trees at real size.
- The view from each tee, and a flyover of each hole.

**Map design**
- Six styles:
  - Forest: lush painted woods with the fairways carved through;
  - Illustrated;
  - Satellite;
  - Topographic;
  - Minimal;
  - Night.
- Colors, fonts (including a brush-script title), paper size, turning the map to fill the page.
- Contours, hill shading, legend, hole table, north arrow, scale bar.

**Export**
- The course map as PDF, PNG or SVG.
- Tee signs, wide 18 × 12 in (as on painted-map signs) or tall: a PDF, or PNG pictures under
  5 MB for UDisc.
- Hole sheets, a scorecard and a 3D picture.
- Hole by hole: a yardage-book page per hole (Letter, A4, a 4 × 6 in card, or a square picture
  for sharing) as one PDF or a ZIP of pictures, and one hole as PDF, PNG, SVG or its own GeoJSON.
- Flyover videos of a hole or the whole course (720p to 4K, 30 or 60 fps), made frame by frame:
  MP4 (H.264) where the browser can encode it, WebM otherwise.
- GPS files: KML for Google Earth, GeoJSON, and GPX waypoints for staking out.
- The hole list and a stake-out list as CSV.
- A parts list with a cost estimate.
- The course file.

## Run it

```
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, build and the full test suite
npm run look       # screenshots of the main screens into look/
```

## Your own server (HyzerLab)

The demo keeps courses in your browser. On your own server, HyzerLab adds what a group needs:

- accounts, invite-only, with two-factor sign-in for everyone (you're the admin);
- courses kept on the server, shared as owner, editor or viewer (and what each viewer sees);
- drafts that editors publish (or send for your OK), and a history to go back to;
- comments pinned on the map, with replies and mentions;
- public course pages, with what each link shows (the map, 3D, tee signs, scorecard…);
- several courses on one park's map.

To run it (Docker):

```
cp .env.example .env          # and fill it in (openssl rand -base64 32 for the secrets)
docker compose up -d
docker compose logs app       # the setup code for the first account, the admin
```

Then open it (over https: a tunnel or a reverse proxy in front of `127.0.0.1:8080`), enter the
setup code, and set up two-factor sign-in. The database is backed up every night into
`./backups` (the last 14 kept). New versions: `docker compose pull && docker compose up -d`.

## Hosting on GitHub Pages

`.github/workflows/deploy.yml` runs the tests on every push. On `main`, once they pass, it
publishes the built site to the `gh-pages` branch.

To turn it on, go to the repository's **Settings → Pages**. Set **Source** to *Deploy from a
branch*, and the branch to `gh-pages` / `(root)`. The site then appears at
`https://<user>.github.io/<repository>/`.

## Credits

- The map engine comes from the Security Camera Planner: site import, terrain, the one 2D/3D
  view and the tree models.
- Imagery © Esri, Maxar and Earthstar Geographics.
- Map data © OpenStreetMap contributors.
- Elevation: USGS 3DEP and AWS Terrain Tiles.
- Par and design guidance: the PDGA's course design pages; see `docs/RESEARCH.md`.
