# HyzerLab

HyzerLab is a disc golf course designer. You pick the piece of ground you want to use, it brings in as much as it can about that ground, and you lay out the holes on top of it. When the layout is done, you can turn it into printable course maps, tee signs and scorecards.

It runs in your web browser. The demo is a static site: no accounts, no server and no API keys. Your courses are kept in your browser unless you run your own server (see [Your own server](#your-own-server)).

## Why this exists

I'm not a coder. I work in IT, and I'm enough of a nerd to want software that didn't exist yet. HyzerLab was built entirely with AI. I brought the problem, plus a fairly unreasonable amount of time spent telling a computer that something still wasn't right.

It's the old story: I had a problem, couldn't find software that fit it, so I built my own. Apparently that's everyone's origin story now. This one's mine.

The part I care about most is the start and the finish. At the start, the app pulls in as much as possible for you: elevation, streets, trees, buildings, paths and water. You pick the area and it fills in what it can. At the finish, it makes maps I think are genuinely good-looking, and you can get from a layout to printable course maps and tee signs without spending hours in Illustrator.

Because AI gave me access to the collective work of millions of developers, I want this to be as free as possible. It's free and open source. With software getting easier to recreate, I don't see much point in locking it down and charging for it.

There's probably still some slop in here. I've tried to keep it to a minimum. If you find some, open an issue.

## What it does

### Bringing in your site

Search for a park or an address, then frame the area the course will use. HyzerLab pulls in:

- **The satellite photo** of the area.
- **Elevation.** In the US this comes from USGS 3DEP. Elsewhere it uses global terrain data, which is much coarser (about 10 m).
- **Trees measured from the air.** Where a USGS LiDAR survey covers the site, each tree comes in at its real spot, height and crown size, along with the bare ground under them.
- **Trees and woods found on the photo**, where there's no survey to use.
- **Paths, creeks, ponds, roads, parking and buildings** from OpenStreetMap.

This gives you a decent starting point instead of plotting everything yourself. It won't be perfect. The app hasn't personally visited your park, so expect to clean some things up: a missing path, woods drawn too large, a building in the wrong spot.

No site yet? You can also design on open ground.

### Laying out holes

Click a tee spot, then a basket spot. That's a hole. From there:

- Bend the throw line with doglegs and set the fairway's width.
- Add more tees (Gold, Blue, White, Red, Green) and more pin positions (A to D). Layouts decide which tee and pin each hole is played from, so one course can have a short and a long version.
- Length, elevation change and par update as you work. Par follows the PDGA method: effective length is the length plus 3 × the climb, adjusted for doglegs and foliage.

You can also add everything else a course needs:

- OB areas and OB lines, hazards, water, creeks, woods and no-go areas. Click the corners, or drag out a rectangle, a circle or a freehand shape.
- One click adds OB along either side of a hole or behind its basket. Water, creeks, roads, fences and paths can be marked OB. They get a red edge on the map and count in the hole's numbers.
- Mandos, drop zones and trees. A mando placed beside a hole faces down it and is passed on the correct side of the line.
- Paths, roads, fences and the walk to the next tee.
- Benches, trash cans, tee signs, the kiosk, restrooms, parking, drinking water, a practice basket, shelters, bridges, first aid, picnic tables and "You are here". Each has its own symbol on the map.

### Checking the course

The review shows the course totals (par, length, walking distance and climb) and an elevation profile for each hole. It also runs two sets of checks:

- **Safety:** throw lines that cross, holes too close together, tees and baskets in another hole's line, and throws across roads and paths or over parking and no-go areas.
- **PDGA design guidance:** tee pad size, trees right in front of tees, minimum hole length, water carries from the shortest tee, overall course length, and whether the course starts and finishes near parking.

These are flags, not rules. You decide what to do about them.

### Seeing it in 3D

The whole course can be viewed in 3D, with tee pads, baskets, signs and trees at real size on the real terrain. You can stand on any tee and look down the hole, or watch a flyover of it. This helps with things that are hard to judge from above, like how much a hill hides the basket or how tight the trees really are.

### Maps, tee signs and scorecards

This is the part I like most. The course map comes in six styles:

- **Forest:** painted woods with the fairways cut through, like a hand-made course map.
- **Illustrated:** a painted park map with drawn grass, trees with shadows and hill shading.
- **Satellite:** the aerial photo with the course drawn over it.
- **Topographic:** contours and relief on a cream map, like a trail map.
- **Minimal:** clean and printer-friendly.
- **Night:** a dark background with bright lines, for screens.

You can change the colors, fonts (including a brush-script title) and paper size, turn the map to fill the page, and turn contours, hill shading, the legend, the hole table, the north arrow and the scale bar on or off.

Tee signs come in a wide 18 × 12 in layout (the size of most painted-map signs) or a tall one.

### Exporting

- The course map as PDF, PNG or SVG.
- Tee signs as a PDF, or as PNG pictures under 5 MB so they can be uploaded to UDisc.
- Hole sheets, a scorecard and a 3D picture of the course.
- A page per hole, like a yardage book (Letter, A4, a 4 × 6 in card, or a square picture for sharing), as one PDF or a ZIP of pictures. A single hole can also be saved as PDF, PNG, SVG or GeoJSON.
- Flyover videos of one hole or the whole course, from 720p to 4K at 30 or 60 fps. The video is MP4 (H.264) where your browser can encode it, and WebM otherwise.
- GPS files: KML for Google Earth, GeoJSON, and GPX waypoints for staking out the course on the ground.
- The hole list and a stake-out list as CSV spreadsheets.
- A parts list with a cost estimate you can adjust.
- The course file itself, so you can keep it or pass it on.

## Things to know

- **The import is a starting point.** It depends on what's been mapped and measured where you are. Expect to fix a few things by hand.
- **The US gets the most detail.** Measured trees and the finest elevation come from USGS data, so they're only available in the US, and only where a survey has been flown. Outside the US, elevation is coarser and trees come from the photo and OpenStreetMap instead.
- **The demo keeps your work in your browser.** If you clear your browser's data, it's gone. Save the course file if you want a copy you control, or run your own server.
- **Flyover videos are made on your computer**, frame by frame. A long 4K video can take a while, and the format depends on what your browser supports.

## Being worked on now

These are on the development branch and not in the main release yet:

- New painted map looks (Golden hour, Brushwood, Storybook, Gouache and others), with the trees, grass, fairways, paths and water each adjustable.
- A built-in help guide with illustrations, and a search that can find any setting and take you to it.
- Showing where you are on the map with your phone's GPS, and placing a tee or basket where you're standing.
- A simpler way to change a hole on a phone without the panel covering the hole.
- OB along any edge, or just part of it.

## Run it

```
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, build and the full test suite
npm run look       # screenshots of the main screens into look/
```

## Your own server

The demo keeps courses in your browser. If you run your own server, HyzerLab adds what a group working on a course needs:

- Accounts, by invite only, with two-factor sign-in for everyone. You're the admin.
- Courses kept on the server and shared as owner, editor or viewer, including what each viewer can see.
- Drafts that editors publish (or send to you for an OK), and a history you can go back to.
- Comments pinned on the map, with replies and mentions.
- Public course pages, where you choose what each link shows (the map, 3D, tee signs, the scorecard and so on).
- Several courses on one park's map.

To run it with Docker:

```
cp .env.example .env          # then fill it in (openssl rand -base64 32 for the secrets)
docker compose up -d
docker compose logs app       # shows the setup code for the first account, the admin
```

Then open it over HTTPS (a tunnel, or a reverse proxy in front of `127.0.0.1:8080`), enter the setup code, and set up two-factor sign-in. The database is backed up every night into `./backups`, and the last 14 backups are kept. To update to a new version, run `docker compose pull && docker compose up -d`.

## Hosting on GitHub Pages

`.github/workflows/deploy.yml` runs the tests on every push, split four ways so they run at the same time. Changes that only touch Markdown or `docs/` skip the tests. On `main`, once the tests pass, it publishes the built site to the `gh-pages` branch.

To turn it on, go to the repository's **Settings → Pages**, set **Source** to **Deploy from a branch**, and pick `gh-pages` / `(root)`. The site then appears at `https://<user>.github.io/<repository>/`.

## Credits

- The map engine started in the Security Camera Planner: the site import, the terrain, the shared 2D and 3D view, and the tree models.
- Imagery © Esri, Maxar and Earthstar Geographics.
- Map data © OpenStreetMap contributors.
- Elevation and LiDAR: USGS 3DEP and AWS Terrain Tiles.
- Par and design guidance: the PDGA's course design pages. See `docs/RESEARCH.md`.

## License

Free and open source under the [GNU Affero General Public License v3.0 or later](LICENSE). Anyone can use it, change it and host it. If you run a changed copy for other people, you have to share your changed code with them.
