# HyzerLab

HyzerLab is a disc golf course designer that runs in your web browser. You pick the piece of ground you want to use, it brings in as much as it can about that ground, and you lay out the holes on top of it. When the layout is done, it turns it into printable course maps, tee signs, hole pages and a scorecard, plus flyover videos and GPS files for staking the course out.

The demo is a static site: no accounts, no server and no API keys. Your courses are kept in your browser. If you run your own server, you also get accounts, sharing, drafts and history, comments and a public page for each course (see [Your own server](#your-own-server)).

## Why this exists

I'm not a coder. I work in IT, and I'm enough of a nerd to want software that didn't exist yet. HyzerLab was built entirely with AI. I brought the problem, plus a fairly unreasonable amount of time spent telling a computer that something still wasn't right.

It's the old story: I had a problem, couldn't find software that fit it, so I built my own. Apparently that's everyone's origin story now. This one's mine.

The part I care about most is the start and the finish. At the start, the app pulls in as much as possible for you: elevation, streets, trees, buildings, paths and water. You pick the area and it fills in what it can. At the finish, it makes maps I think are genuinely good-looking, and you can get from a layout to printable course maps and tee signs without spending hours in Illustrator.

Because AI gave me access to the collective work of millions of developers, I want this to be as free as possible. It's free and open source. With software getting easier to recreate, I don't see much point in locking it down and charging for it.

There's probably still some slop in here. I've tried to keep it to a minimum. If you find some, open an issue.

## The four steps

You work left to right along the top bar (along the bottom on a phone). You can go back to any step at any time, and a change in one shows up in the others right away.

1. **Site** brings in the real place: the photo, the elevation, the trees and what's mapped around it.
2. **Design** is the course itself: holes, tees, baskets, OB, mandos, paths, trees and everything else that stands on the course.
3. **Map** designs what gets printed: the course map, the tee signs, the hole pages and the scorecard.
4. **Export** makes the files.

The app has a built-in help guide with an entry for every feature and setting. Press **?** to open it. Press **Ctrl+K** (or **/**) to search for anything, such as a hole number, a tool or a setting like "tree spacing", and the app takes you to it and points at it.

## Site: bringing in the ground

Search for a park or an address, then frame the area the course will use (up to 6,000 ft each way). **Bring in this site** fetches the photo and the elevation, plus whatever you ticked:

- **Satellite photo.** In North Carolina it comes from NC OneMap's 6-inch statewide imagery, which is sharper than most. Everywhere else it's Esri World Imagery, at the sharpest zoom available for that spot. You can use an OpenStreetMap street map instead.
- **Elevation.** In the US this comes from USGS 3DEP. Where 3DEP isn't available, it falls back to global terrain tiles, which are much coarser (about 10 m).
- **Real trees and ground (aerial survey).** LiDAR is a survey flown with a laser scanner that measures the ground and everything on it. Where a USGS survey covers the site, the app reads its public point cloud tiles straight into your browser and finds each tree's spot, height and crown size, along with the bare ground under them. The measured ground replaces the elevation from 3DEP, and the trees are grouped into stands of woods.
- **Trees spotted on the satellite photo.** Woods, single trees and open water traced from the satellite photo. This is used when there's no survey: the photo's trees aren't mixed in with measured ones.
- **Paths, roads, water and buildings** from OpenStreetMap. Buildings come in with their height and roof shape where those are mapped. If the usual OpenStreetMap servers are busy, it asks another one, and then falls back to OpenFreeMap's tiles, which carry the same data.

When it finishes, it tells you what it brought in and where it came from. **Brought in automatically** lists the imported woods, trees, paths and water, and **Remove all** takes out a whole group if you'd rather draw your own. **Update paths, roads and water** fetches OpenStreetMap again and replaces only what came from it before, not what you drew.

You can resize or move the site later and bring it in again. Your holes and everything you drew stay on the same spot on the ground. Things that end up outside the new frame are kept, so you can move them in or delete them.

No site yet? You can also design on open ground.

### Measured trees

With a LiDAR survey in, a few settings decide what stands on the course:

- **Leave out trees shorter than** drops the short ones.
- **Growth since the survey** adds the years since it was flown. **Grow to today** fills in the right number, and seedlings appear in the clearings.
- **Clear trees from the fairways** clears the measured trees where the holes play. Turn it off if you'd rather keep them and cut by hand.

Trees you cut by hand can be brought back from the same panel.

### What to expect from the import

The import is a starting point, not a survey of your park. It depends on what's been mapped and measured where you are, so expect to clean some things up: a missing path, woods drawn too large, a building in the wrong spot.

- **Measured trees are US only, and coverage is patchy.** They come from USGS surveys, so they're only there where one has been flown. The app picks the newest survey over the site, reading the year from the survey's name (including USGS's newer work codes, where A22 means 2022). If that survey sees hardly any trees, for example because it was flown with the leaves off, it tries the next one. An old survey won't show trees planted or grown since, which is what **Grown since the survey** is for.
- **Where a survey saw few trees in a wooded area,** the app fills that area in with trees it plants between the measured ones, since the survey most likely missed them or they've grown since.
- **Outside the US there are no measured trees,** and elevation comes from the global terrain tiles at about 10 m. Hills show up, but small rises, ditches and banks won't. Trees come from the photo and OpenStreetMap instead.
- **Trees spotted on the photo are estimates.** Their heights are guessed from the size of the crown, and in dense forest, where the crowns touch, it finds only about half of the trees. Stands of trees come in as woods areas, which fill themselves with trees, and only the trees standing on their own come in one by one.
- **A big site takes longer.** The LiDAR is downloaded and decoded in your browser a tile at a time, so a larger area means more to download.

## Design: laying out the course

Press **H** (or **New hole**), click where the tee goes, then where the basket goes. That's a hole. The tool stays on, so you can keep clicking out the next holes, and **Esc** goes back to the pointer. Pick anything on the map to change it in its panel on the right.

### Holes, tees and pins

- **Bend left** and **Bend right** curve the line of play, or drag the dot halfway along it to add a dogleg. **Plot the line** lets you click it out point by point.
- **Draw the fairway** shows the mown path from tee to basket on the map and in 3D. Set its width, or turn off **Even width** to make it wider or narrower along the way.
- A hole can have several tees (Gold, Blue, White, Red, Green and Purple, by skill level) and pin positions (A to D). **T** adds another tee and **B** another pin for the hole you picked.
- **Layouts** decide which tee and pin each hole is played from, so one course can have a short and a long version. The lengths, par, tee signs and scorecard follow the layout you're working on.
- Length, elevation change, plays-like length and par update as you work. Par follows the PDGA method: the effective length is the length plus 3 × the climb, adjusted for doglegs and foliage. You can set par yourself instead.

### OB, hazards and everything else on the course

- **Areas** (O): OB, hazards, water, woods, tall grass, parking and no-go areas. Click the corners, or drag out a rectangle, a circle or a freehand shape. A woods area grows its own trees, and you choose the mix, how thick and how tall, plus underbrush. Where the course has measured trees, **Trees in these woods** sets what stands there: the real trees, the real trees plus ones the app plants in patches you draw, only trees the app plants, or none. No tree ever stands in a building, on a road or path, or in water.
- **Lines** (L): paths, roads, fences, creeks, OB lines and the walks between holes. Paths and walks have a surface (dirt, gravel or paved).
- **OB in one click.** A hole's panel has **Add OB** buttons for the left side, the right side and behind the basket.
- **Marking things OB.** Any area's edge, or a line such as a road, path, fence or creek, can be marked OB all the way round (or all along it) or only along a stretch you mark, and a line can be OB for some holes only. **OB and beyond** makes everything past a line OB too. It picks the side away from the holes beside it (**Auto**), or you choose the side yourself. OB gets a red edge on the map and counts in the hole's numbers.
- **Mandos** (M) and **drop zones** (Z) belong to a hole. A mando's panel says which side the disc must pass.
- **Trees** (R): leafy trees, pines and bushes, each with its species, height, spread and lean.
- **Build** (S): bridges, boardwalks, stairs, walls, buildings, shelters and decks.
- **Amenities** (A) and **labels** (K): benches, trash cans, tee signs, the kiosk, restrooms, parking, drinking water, a practice basket, shelters, bridges, first aid, picnic tables and "You are here". Each has its own symbol on the printed map.
- **Measure** (D): click a start point, then click anywhere to see the distance and the climb from it. The start stays put, which is useful when you're checking one tee against several basket spots.

Undo (**Ctrl+Z**) takes back the last change, and redo (**Ctrl+Shift+Z**) puts it back. Right-click anything (or hold on it on a phone) for its menu: copy, duplicate, lock and delete.

### Checks

The **Checks** button in the top bar lists possible problems and shows each one on the map:

- **Safety:** throw lines that cross, holes closer together than the safe distance (which you can set), tees and baskets in another hole's line, and throws across roads and paths or over parking, buildings and no-go areas.
- **Getting around:** no path between one hole's basket and the next hole's tee, and long walks between holes. Walks aren't drawn for you, so this is how you find the ones you still need to draw.
- **PDGA design guidance:** tee pad size, trees right in front of tees, minimum hole length, water carries from the shortest tee, overall course length, and whether the course starts and finishes near parking.

These are flags, not rules. If one is fine the way it is, **Ignore** it. The choice is kept with the course, and the **Ignored** list lets you check it again later.

## 3D, tee views and flyovers

The map is one view in 2D and 3D. Press **2** or **3** to switch, or right-drag (Ctrl+drag) to turn and tilt. Tee pads, baskets, signs, buildings and trees are at real size on the real terrain. This helps with things that are hard to judge from above, like how much a hill hides the basket or how tight the trees really are.

- **View from tee** (Enter) stands you on the tee looking down the hole. **[** and **]** go to the other holes.
- **Fly over** flies from behind the tee down to the basket. It works out the flight by itself, or you can set keyframes (each one's spot, height and view) in the hole's panel.
- **Camera** sets the flight's height, speed and field of view, and what shows on screen (the hole's title, its distance, the course name). Settings can be for all holes or one.
- **Record** makes a video of one hole or the whole course, at 720p, 1080p, 1440p or 4K and 30 or 60 fps. It records in the background while you keep working. The video is MP4 (H.264) where your browser can encode it, and WebM otherwise.

The **View** panel sets what you see while you work (the satellite photo, contour lines, hill shading, grass and wind). It also sets the course's landscape, which changes the colors of the trees, grass and ground everywhere: wooded park, open park, pine forest, dry grass, autumn or desert.

## Map: the printed course map, tee signs and cards

The Map step has a tab for each thing you print. **General** holds what they all share: the logo, colors and lettering, and how baskets and OB are marked (including the PDGA's marking colors).

**Course map.** Pick a style for the whole map: Classic, Brushwood, Hollow, Golden hour, Storybook or Gouache. Then change any part of it on its own: the trees, grass, fairways, paths and roads, and water. **Light and shadow** sets golden hour, midday or night, and where the sun is (along its real path for the site), and the 3D view uses the same light. You can draw throw lines, distances, putting circles, contour lines and hill shading on top.

Everything on the page (title, hole guide, legend, north arrow, scale bar and credits) can be shown or hidden, moved and resized, and you can add your own text and pictures. Paper sizes go from Letter and A4 up to a 36 × 48 in poster. **Turn to fill the page** turns the map so the course fills the paper, and **North up** turns it back.

**Tee signs** come in four looks (Classic, Trailhead, Field guide and Open view) at 18 × 12 in (the size of most painted-map signs), 12 × 18 in or 18 × 24 in. You choose what's on them, such as the other holes faded or hidden, and what goes under the notes.

**Hole pages** give each hole its own page, like a yardage book: Letter, A4, a 4 × 6 in card, or a square picture for social media. The **scorecard** follows the layout you're working on.

## Export

- The course map as PDF, PNG or SVG.
- Tee signs as a PDF, or a ZIP of PNG pictures under 5 MB each so they can be uploaded to UDisc.
- The scorecard, and a 3D picture of the view as it is.
- All hole pages as one PDF or a ZIP of pictures. A single hole can also be saved as PDF, PNG, SVG or GeoJSON.
- Flyover videos (see above).
- GPS files: KML for Google Earth, GeoJSON, and GPX with every tee and basket for staking out the course on the ground. These need a site that was brought in, since a course on open ground has no real location.
- The hole list and a stake-out list as CSV spreadsheets.
- A parts list with a cost estimate. You can change the prices.
- The course file itself (`.dgcourse.json`), so you can keep a copy or pass it on.

## On the course with a phone

Everything works by touch. On a phone the steps are along the bottom, and the panel is a sheet you drag up for more settings or down for more map. One finger pans, pinch zooms, two fingers up or down tilt into 3D, and two fingers sideways turn the map. Hold on open ground to start something right there: a tee or pin for the hole you're on, a bend in its line, a new hole, or a measurement.

Tap a hole and the panel drops to a short strip, so the hole stays in view. The strip shows its par, fairway, tees, pins, OB and foliage. Tap one to change it, and drag the dial for the fairway's width while the map follows. The arrows by the hole's name go to the next and previous holes.

### Where you are

The locate button by the zoom buttons shows you as a blue dot that moves as you walk. The pale circle is how sure the phone is of your position, and the small fan shows which way you're facing. Under the dot it shows how far you are from the basket of the hole you picked (or the hole you're nearest), with a dashed line to it.

While the button is filled in, the map follows you and the screen stays awake. Move the map yourself and it stops following, and tapping the button follows you again. A grey dot means the reading is old or weak.

You can also lay out holes by walking them. Show where you are, pick **New hole**, stand on the tee spot and tap **Tee here**, then walk to the basket spot and tap **Basket here**. It waits for you to hold still for a moment to get a steady reading. To move something you already placed, pick it and use **Put it where I'm standing**: the phone listens for about ten seconds, keeps its best readings and shows how close it got, and **Move it here** puts it there.

Things to know:

- The site must be brought in (so the course has a real place on the earth), and the page must be on HTTPS. Browsers don't give out your location otherwise.
- Phone GPS is usually good to within 10 to 15 ft in the open, and worse under heavy tree cover or near buildings. Stand in the open and give it a few seconds.

## Saving

In the demo, your work is saved in this browser by itself. If you clear your browser's data, it's gone. To keep a copy you control, or move a course to another computer, use the course menu (the arrow by the course name): **Save as a file** and **Open a course file**.

On your own server, the course saves a moment after each change, and **Ctrl+S** saves at once. If a save fails, the top bar says **Not saved**. Click it to try again.

## Your own server

The server (Fastify and Postgres, in `server/`) adds what a group working on a course needs:

- **Accounts, by invite only,** with two-factor sign-in required for everyone. The first account is the admin, and everyone after comes in by an invite link the admin makes. No email address is needed or kept.
- **Sharing.** Courses are kept on the server and shared by username, as viewer, editor or co-owner. You choose what viewers can see.
- **Drafts and history.** You work live (changes go straight into the course) or in a draft of your own that you publish when it's ready. With **Need my OK before they go in** turned on, editors send their drafts to the owner, who accepts or declines them. History lists every version: you can look at one, compare it with now, or restore it. Restoring makes a new version, so nothing is lost.
- **Comments** pinned to any spot on the map, with replies, @mentions and assignments. Anyone on the course can resolve a thread when it's done.
- **Public links and the public course site.** A public link shows a course page to anyone who has it. You pick what each link shows (the map, 3D, flyovers, the printed map, tee signs, the scorecard, the course's numbers, downloads), and you can give it a password and an end date. The public page shows the version you last published, never a draft or the course while it's being changed. Use **Update site** after changes.
- **Parks.** Name the park a course is in, and other courses in the same park show on its map, including close calls between their holes.

To run it with Docker:

```
cp .env.example .env          # then fill it in; the comments show how to make the secrets
docker compose up -d
docker compose logs app       # shows the setup code for the first account, the admin
```

The app answers on `127.0.0.1:8080` (or the `PORT` you set). Put it behind a tunnel or a reverse proxy and open it over HTTPS, because the sign-in cookies need it. Then enter the setup code and set up two-factor sign-in. The database is backed up every night into `./backups`, and the last 14 backups are kept. To update to a new version, run `docker compose pull && docker compose up -d`.

To work on the server itself, start a development database with `docker compose -f server/compose.dev.yml up -d`, then run `npm ci && npm run dev` in `server/` (with a `server/.env`), and `VITE_SERVER=1 npm run dev` for the app, which passes `/api` to the server.

## Run it

```
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, build and the full test suite
npm run look       # screenshots of the main screens into look/
```

The default build is the demo. `VITE_SERVER=1` builds the same app for a HyzerLab server, behind sign-in.

## Hosting on GitHub Pages

`.github/workflows/deploy.yml` runs the tests on every push, split four ways so they run at the same time. Changes that only touch Markdown, `docs/` or the server skip them (the server has its own workflow). On `main`, once the tests pass, it publishes the built site to the `gh-pages` branch.

To turn it on, go to the repository's **Settings → Pages**, set **Source** to **Deploy from a branch**, and pick `gh-pages` / `(root)`. The site then appears at `https://<user>.github.io/<repository>/`.

## Credits

- The map engine started in the Security Camera Planner: the site import, the terrain, the shared 2D and 3D view, and the tree models.
- Imagery © Esri, Maxar, Vexcel and Earthstar Geographics, and © NC OneMap / NC Orthoimagery Program.
- Map data © OpenStreetMap contributors, also through OpenFreeMap's tiles.
- Elevation and LiDAR: USGS 3DEP, the USGS LiDAR point clouds on AWS, and AWS Terrain Tiles.
- Par and design guidance: the PDGA's course design pages. See `docs/RESEARCH.md`.

## License

Free and open source under the [GNU Affero General Public License v3.0 or later](LICENSE). Anyone can use it, change it and host it. If you run a changed copy for other people, you have to share your changed code with them.
