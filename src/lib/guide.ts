// Every feature and setting, once: what it is, what it's for, and where it is. The help guide reads
// it as chapters, and search (Ctrl+K) finds any of it and takes you there.
import type { Step } from "../state/course";

export type GuideSection = "start" | "site" | "design" | "view" | "map" | "export" | "share" | "phone" | "keys";

/** Where a setting is: the step and tab, what to open, and the control to point at. */
export interface Where {
  step?: Step;
  tab?: "general" | "map" | "sign" | "page" | "scorecard";
  /** A part of the map style to open (Map step, Course map tab). */
  look?: "trees" | "grass" | "fairway" | "paths" | "water" | "light" | "elevation";
  /** A panel or popover to open first. */
  open?: "view" | "course" | "problems" | "share-public" | "share-people";
  /** A thing to pick first (its panel holds the setting). */
  pick?: "hole" | "tee" | "basket" | "woods" | "water" | "line" | "tree" | "structure" | "walk";
  /** The control: its test id, and within it a row by its words. */
  find?: string;
  /** A sentence to point at it with (Getting started's Show me). */
  say?: string;
  text?: string;
}

export interface Topic {
  id: string;
  section: GuideSection;
  title: string;
  /** What it does, in a few plain sentences (a blank line starts a new paragraph). */
  body: string;
  /** Steps, when it's something to do. */
  steps?: string[];
  /** Other words people search with. */
  words?: string;
  /** The way there, as a path ("Map › Course map › Light and shadow"). */
  path?: string;
  where?: Where;
  /** Only on a HyzerLab server (accounts, sharing), or only in the browser-only app. */
  server?: boolean;
}

/** `short`: its name in the list of chapters. */
export const SECTIONS: { id: GuideSection; title: string; short?: string; intro: string }[] = [
  { id: "start", title: "Getting started", intro: "HyzerLab lays out a disc golf course on the real ground, then makes what the course needs from it: a printed map, tee signs, hole pages, a scorecard, videos and GPS files. You work through four steps, left to right along the top bar." },
  { id: "site", title: "Site", intro: "The Site step brings in the real place: the satellite photo, the elevation, the trees, and the paths, roads and water around it. It pulls in what it can. Expect to clean some of it up." },
  { id: "design", title: "Design", intro: "The Design step is the course itself: holes, tees and baskets, OB, mandos, paths, trees and anything else out there. Pick something to change it in its panel." },
  { id: "view", title: "3D, tee views and flyovers", short: "3D and flyovers", intro: "The map works in 2D and 3D. You can look at a hole from its tee, fly over it, and record the flight as a video." },
  { id: "map", title: "Map: the printed course map, signs and cards", short: "Map", intro: "The Map step is where you design what gets printed: the course map, the tee signs, the hole pages and the scorecard. The tabs at the top pick which one you're looking at, and the panel only shows that one's settings." },
  { id: "export", title: "Export", intro: "The Export step makes the files: PDFs and pictures to print, videos, and GPS and spreadsheet files for whoever's putting the course in the ground." },
  { id: "share", title: "Saving, sharing and working together", short: "Sharing", intro: "On a HyzerLab server the course saves as you go and keeps its history. You can share it with people, work in drafts, and publish a public course page." },
  { id: "phone", title: "On a phone or tablet", short: "Phone and tablet", intro: "Everything works by touch. On a phone the steps are along the bottom, and the panel is a sheet you drag up and down." },
  { id: "keys", title: "Keyboard shortcuts", intro: "Most tools have a key. Press ? any time to open this guide." }
];

export const TOPICS: Topic[] = [
  // ------------------------------------------------------------------ Getting started
  {
    id: "getting-started", section: "start", title: "Getting started",
    body: "Getting started is a short list of the main things to do, from finding your park to printing tee signs. It ticks itself off as you do them, in any order, and each one's Show me takes you to the real control and points at it.\n\nDone something another way, or don't need it? Tap its circle to tick it off yourself, and tap again to untick it. Close the list with its ×. To bring it back, use the list button at the top (by the ?), the menu on a phone, search, or the Getting started button at the top of this guide. On the dashboard its card has an × too, and Show Getting started under Learn the app puts it back.",
    words: "getting started tutorial tour checklist learn basics show me around tick off close bring back dashboard",
    path: "The list button at the top · Help › Getting started"
  },
  {
    id: "steps", section: "start", title: "The four steps",
    body: "HyzerLab works in four steps along the top bar. Site brings in the real place. Design is where you lay out the holes. Map is the printed stuff, and Export makes the files.\n\nYou can jump between them whenever you like. They all work on the same course, so a change in one shows up in the others right away.",
    words: "workflow order site design map export tabs"
  },
  {
    id: "first-course", section: "start", title: "Your first course",
    body: "This gets you from nothing to a printed map. None of it is final, so don't overthink it.\n\nIf you just want to try things without a real place, Start on open ground on the welcome screen skips the Site step.",
    steps: [
      "On the Site step, click Find your park, search for the park, and frame the area the holes will use. Then click Bring in this site.",
      "On the Design step, press H (or click New hole). Click where the tee goes, then where the basket goes. Keep clicking for the next holes, and press Esc when you're done.",
      "Click a hole to set its par, fairway, OB and notes in its panel.",
      "On the Map step, pick a map style, then turn on the hole guide and the legend under On the page.",
      "On the Export step, download the course map as a PDF, or the tee signs."
    ],
    words: "tutorial begin new course how to start open ground blank"
  },
  {
    id: "pointer", section: "start", title: "Select, move and the pointer",
    body: "The Select tool (V) is the pointer. Click a hole, a tee, an area or a tree to pick it and open its panel. Drag it to move it, or drag its handles to reshape it.\n\nShift+click adds something to the selection or takes it out, and Shift+drag draws a box around several things. The Move the map and Select buttons above the tool bar choose what a plain drag does. Esc always gets you back to the pointer.",
    words: "select pick move drag handles selection box"
  },
  {
    id: "undo", section: "start", title: "Undo and redo",
    body: "Undo (Ctrl+Z) takes back your last change, and Redo (Ctrl+Shift+Z) puts it back. The buttons are at the right end of the tool bar.\n\nDragging a slider counts as one change, not one per wiggle, so one Undo puts it back where it started.",
    words: "undo redo mistake back ctrl z"
  },
  {
    id: "search", section: "start", title: "Search for anything",
    body: "Press Ctrl+K (or /, or click the magnifier in the top bar) and type what you're after. A hole number, a step, a tool, a name on the map, or a setting like \"fairway width\" or \"tee sign look\". Pick a result and HyzerLab takes you there and points at it.\n\nOn a phone it's Search settings and help, in the app menu.",
    words: "find go to search spotlight command palette ctrl k"
  },
  {
    id: "hover", section: "start", title: "What a button does",
    body: "Rest the mouse on a button to see what it does and its key. If a button is dimmed, there's usually a note nearby saying why. Most of Export's buttons, for example, need at least one hole with a tee and a basket.",
    words: "tooltip hover icon label dimmed disabled"
  },
  {
    id: "the-demo", section: "start", title: "The public demo",
    body: "This is the public demo of HyzerLab. You can design a full course here: bring in a park, lay out the holes, and make the maps and tee signs. It all saves in this browser.\n\nThe parts that need other people have a lock on them: accounts, sharing, comments, drafts and history, the public course page, and courses that share a park. There's no server behind the demo to keep any of that. Tap one and it tells you what it does. To use them, run HyzerLab on your own server. It's free and open source, and the README walks you through the setup.",
    words: "demo public locked lock self host host your own server account sharing comments github pages",
    path: "Top bar › Demo", server: false
  },
  {
    id: "save-local", section: "start", title: "Saving (in this browser)",
    body: "Without an account, your course saves by itself in this browser. It only lives on this computer, though. Clear the browser's site data and it's gone.\n\nTo keep a copy, or move it to another computer, open the course menu (the little arrow next to the course name) and pick Save as a file. Open a course file… brings it back in.",
    words: "save file open download backup",
    path: "Top bar › course name › menu", server: false
  },
  {
    id: "save-server", section: "start", title: "Saving (on the server)",
    body: "On a HyzerLab server the course saves itself a moment after each change. The chip in the top bar says Live or Draft, and its dot pulses while it saves. Ctrl+S saves right now.\n\nIf a save fails, Not saved · try again shows up next to the chip. Click it to send your changes again. If someone else saved over you at the same time, Not saved lets you keep yours (Save mine) or load theirs (Open theirs).",
    words: "save autosave ctrl s not saved conflict",
    server: true
  },

  // ------------------------------------------------------------------ Site
  {
    id: "find-site", section: "site", title: "Find and bring in the site",
    body: "This is where you bring in the real place. Search for the park, frame the area the holes will use, and Bring in this site pulls in the photo, the elevation and whatever you ticked. It's a starting point. It has not personally visited your park, so expect some cleanup.\n\nDrag the frame's corners to resize it, or Shift+drag to draw a new one (on a phone, Draw the area or Use this view). There's a size limit, shown under the map. To change the area later, use Resize or re-import the site.",
    steps: ["On the Site step, click Find your park.", "Search for the park or an address, and pick it.", "Frame the area the holes will use.", "Tick what to bring in, then click Bring in this site."],
    words: "import address park location satellite resize area frame find your park re-import",
    path: "Site › Find your park (or Resize or re-import the site)",
    where: { step: "site", find: "site-info" }
  },
  {
    id: "import-options", section: "site", title: "What comes in with a site",
    body: "These pick what gets pulled in with the site. The more that comes in, the less you have to draw yourself. The elevation always comes in.\n\nSatellite photo is the picture under the map (turn it off for a street map). Real trees and ground (aerial survey) is USGS LiDAR: every tree's spot and height, and the bare ground, measured from the air. It's US only, and only where a survey's been flown. HyzerLab uses the newest one.\n\nTrees spotted on the satellite photo traces woods, trees and water from the picture. It's only used for trees where there's no aerial survey, because the survey is a lot better at it. Paths, roads, water and buildings come from OpenStreetMap, so they're only as good as the local mapping. Buildings it's missing are traced from the air (outlines from Microsoft and others, by way of Overture Maps). They come in shaped like the roof on the photo, and only where the tracing is sure.\n\nIn the US the elevation is fine detail (USGS). Outside the US there's no survey, and the elevation is coarse, about 10 m (33 ft) between readings, so small banks and bumps won't show.",
    words: "lidar usgs aerial survey openstreetmap osm photo trees spotted satellite paths water roads buildings parking options elevation outside us",
    path: "Site › Find your park › Bring in"
  },
  {
    id: "refresh-osm", section: "site", title: "Update paths, roads and water",
    body: "This asks OpenStreetMap again and swaps in what it has now, along with the buildings traced from the air. Handy if the first import missed something, or someone's fixed the map since.\n\nIt replaces everything that came from OpenStreetMap before, including shapes you've edited since. Things you drew yourself stay put. Undo brings the old ones back.",
    words: "openstreetmap osm refresh paths roads water again update",
    path: "Site › Update paths, roads and water",
    where: { step: "site", find: "refresh-osm" }
  },
  {
    id: "brought-in", section: "site", title: "Brought in automatically",
    body: "This lists what the import added on its own: woods, trees and water traced from the photo, the shapes from OpenStreetMap, and the buildings traced from the air. If you'd rather draw your own, Remove all takes a whole group out at once.\n\nIt only shows up when there's something to list. Undo puts a removed group back.",
    words: "remove imported photo trees osm areas",
    path: "Site › Brought in automatically",
    where: { step: "site", find: "photo-found" }
  },
  {
    id: "lidar", section: "site", title: "Measured trees (LiDAR)",
    body: "Measure trees and ground reads an aerial LiDAR survey of the site. That's a laser scan flown over the land, so you get the real trees (spot, height, crown) and the real shape of the ground under them. It's only in the US, where USGS has flown one.\n\nIt uses the newest survey over the site. If that one barely sees any trees (an old thin scan, or one flown with the leaves off), it tries the next one and keeps whichever saw more. If there's no survey at all, it says so and nothing changes.\n\nMeasure again reads it all over, say after resizing the site. It replaces the measured trees and their settings, including the trees you kept or cut. Remove the measured trees takes them all out. Undo brings either back.",
    words: "lidar measure survey trees heights ground usgs remove real trees aerial measure again",
    path: "Site › Real trees and ground",
    where: { step: "site", find: "lidar-info" }
  },
  {
    id: "lidar-settings", section: "site", title: "Measured trees: settings",
    body: "These change how the measured trees are used. You can drop the little ones, grow them up to today, and decide whether the trees where your holes play get cleared.\n\nLeave out trees shorter than hides the measured trees under that height (the count says how many are left). Growth since the survey ages every tree by that many years and fills in some young ones in the gaps and edges. Grow to today sets it to the years since the survey was flown. It's an estimate, not a new survey.\n\nClear trees from the fairways cuts down the measured trees where the holes play. Turn it off to keep them all and cut by hand instead. Bring them back restores saplings and planted trees you cut by hand, and Remove those placed by hand takes out trees you planted right on top of a measured one.",
    words: "measured tree settings leave out shorter smallest growth since survey grow to today years saplings clear trees from the fairways cut",
    path: "Site › Real trees and ground › Measured tree settings",
    where: { step: "site", find: "lidar-settings" }
  },
  {
    id: "course-info", section: "site", title: "Course name, designer and units",
    body: "The course's name, who designed it, and whether distances are in feet or meters. The name also shows in the top bar, and the designer goes on the signs and in the map's credits.",
    words: "name designer feet meters units distances",
    path: "Site › Course",
    where: { step: "site", find: "side-panel", text: "Distances in" }
  },

  // ------------------------------------------------------------------ Design
  {
    id: "holes-column", section: "design", title: "The holes column",
    body: "Down the left side of the map: every hole with its length and par. Click one to pick it and zoom to it. New hole at the bottom starts the hole tool.\n\nWhen you pick something, its panel opens right next to the list, and the list shrinks to just the hole numbers so the rest of the map stays clear. Esc or the X closes it.\n\nWith more than one layout, the layout picker is at the top. The totals at the bottom (holes, par, total length) open the course's own settings. On a phone, the same list is in the Design step's panel.",
    words: "holes list column totals",
    path: "Design › holes column",
    where: { step: "design", find: "holes-column" }
  },
  {
    id: "new-hole", section: "design", title: "Lay out a hole",
    body: "Press H or click New hole, then click where the tee goes and where the basket goes. That's a hole. The tool stays on, so keep clicking for the next ones, and press Esc when you're done.\n\nHoles number themselves in the order you make them. To change one, type it in the No. box in the hole's panel. Type 3/12 for a hole that's played twice. The color chips above the tool bar set the new tee's color.",
    words: "new hole add tee basket number",
    path: "Design › New hole (H)",
    where: { step: "design", find: "new-hole" }
  },
  {
    id: "hole-panel", section: "design", title: "A hole's panel",
    body: "Pick a hole and its panel shows its length, how much it climbs or drops, and how long it plays. Buttons up top let you view it from the tee, fly over it, or add OB along it.\n\nFurther down: par and foliage, the fairway, its name, and its notes and hole rules (those print on its tee sign). In play counts the trees on the throw line and says whether OB is in play.\n\nThe panel sits on the left, next to the holes. On the Site step it takes over the step's panel instead, with a back arrow to the step.",
    words: "hole inspector panel par notes name length elevation profile in play",
    path: "Design › pick a hole",
    where: { step: "design", pick: "hole", find: "inspector" }
  },
  {
    id: "par", section: "design", title: "Par and foliage",
    body: "Par is worked out for you from how long the hole plays, using the PDGA's par guidelines, until you pick a number. Climbs, doglegs and heavy foliage all make a hole play longer. Foliage says how wooded it is, and Heavy can bump the par up.\n\nAuto foliage goes by the trees in the fairway: about one every 60 ft counts as heavy. Plays like, in the hole's numbers, is the length par is worked out from. Par also depends on the tee color, since longer tees are expected to play longer.",
    words: "par pdga foliage heavy light plays like effective length",
    path: "Design › a hole › Par and play",
    where: { step: "design", pick: "hole", find: "inspector", text: "Foliage" }
  },
  {
    id: "fairway", section: "design", title: "Fairway",
    body: "Draw the fairway paints the mown strip from tee to basket, on the map and in 3D. Fairway width sets how wide it is.\n\nTo shape it, pick the hole and drag the handles along the fairway's edges. Each one makes that side wider or narrower there, and holding Shift moves both sides. Double-click a handle to get rid of it. Even width puts it back to one width all along.",
    words: "fairway width even shape mown",
    path: "Design › a hole › Draw the fairway",
    where: { step: "design", pick: "hole", find: "inspector", text: "Draw the fairway" }
  },
  {
    id: "line-of-play", section: "design", title: "The line of play: bends and plotting",
    body: "The line of play is the route a throw is meant to take from tee to basket. Bend it to match a dogleg, so the length, par and checks follow the real route instead of a straight line.\n\nBend left and Bend right add a gentle curve, and Straighten takes the bends out. You can also drag the dot halfway along the line to bend it there, drag a turn to move it, or double-click a turn to remove it. Plot the line lets you click the line out point by point (or drag it freehand), then Done.",
    words: "dogleg bend curve plot line straighten throw line",
    path: "Design › a hole › Plot the line",
    where: { step: "design", pick: "hole", find: "plot-line" }
  },
  {
    id: "tees-pins", section: "design", title: "More tees and pins",
    body: "A hole can have more than one tee and more than one pin. Tees are colored by skill level, and pins are lettered A, B, C and D. The Tee tool (T) and Pin tool (B) add another one to the hole you've picked.\n\nTees and baskets, near the top of the hole's panel, has a row for each one with how long the hole plays from it. Click a row to open its settings right there (it's picked on the map too), and click it again to close it. Clicking a tee or basket on the map does the same thing: you get the hole's panel with that one open, so the hole's settings are never more than a scroll away.\n\nPlay to another hole's basket instead lets a hole share a basket. Layouts decide which tee and pin each hole is played from.",
    words: "tee pin position another tee basket skill level color share basket tees and baskets",
    path: "Design › a hole › Tees and baskets",
    where: { step: "design", pick: "hole", find: "hole-parts" }
  },
  {
    id: "ob", section: "design", title: "Out of bounds (OB)",
    body: "OB is anywhere a disc that lands costs a penalty throw. You can drop OB beside a hole from its panel, draw OB areas or OB lines, or make the edge of almost anything OB.\n\nIn a hole's panel, Add OB puts an OB line along its Left side, Right side, or Behind basket, ready to tweak with its handles. The Area tool's OB kind draws an area that's OB inside. The Line tool's OB line is OB on the side away from play.\n\nAny other area or line has Out of bounds in its panel. OB, red edge makes its edge OB all the way. For just part of it, click Only a stretch, then click where the OB starts and where it ends. Round a closed shape, the stretch goes the way you moved the pointer. Water and streams count as OB unless you set Not OB.\n\nFor a road, path, fence or stream, OB and beyond makes everything past the line OB too. Out of bounds to the picks which side: Auto (the app's guess, away from the holes) or a side by compass, like East side. OB for limits a line's OB to some holes.",
    words: "ob out of bounds red line edge stretch only a stretch hazard beyond out of bounds to the side auto",
    path: "Design › a hole › Add OB",
    where: { step: "design", pick: "hole", find: "ob-left" }
  },
  {
    id: "mando", section: "design", title: "Mandos and drop zones",
    body: "A mando makes players pass a post or tree on one side. The Mando tool (M) puts one on the hole you've picked, as One post or a Gate of two. For a single post, its panel sets which side the disc has to pass.\n\nThe Drop zone tool (Z, under More tools) places a drop zone. Both belong to a hole, and Belongs to in their panel changes which.",
    words: "mando mandatory gate drop zone dz",
    path: "Design › tool bar › Mando (M), Drop zone (Z)"
  },
  {
    id: "course-more", section: "design", title: "The course's own settings",
    body: "Click the totals at the bottom of the holes column for the course's own stuff: its par, total length, walking distance and layouts.\n\nThe walking distance adds up the straight lines from each basket to the next tee, so the real walk is longer.",
    words: "totals course popover layouts walking distance",
    path: "Design › holes column › totals",
    where: { step: "design", open: "course", find: "course-more" }
  },
  {
    id: "layouts", section: "design", title: "Layouts",
    body: "A layout is one way to play the course: which tee and which pin every hole uses. They only matter once your holes have more than one tee or pin. Say Main plays the blue tees to pin A, and Long plays the gold tees to pin B, so the same holes give you a shorter and a longer course. If every hole has just one tee, every layout plays the same and switching does nothing.\n\nAdd one with Edit layouts. If its tee color is missing, the holes column offers to add those tees for you, set back (or ahead) of the ones you have, and you drag them where you want.\n\nWith more than one, pick the one you're working on at the top of the holes column. Its tees and pins stand out on the map, the other layouts' shrink to faint dots, and new tees take its color. The lengths, par, tee signs and scorecard all follow it. A hole with no tee in its color plays from the nearest one, and its panel offers to add one.",
    words: "layout tees pins main red blue gold long short active switch which",
    path: "Design › totals › Edit layouts",
    where: { step: "design", open: "course", find: "course-more", text: "Edit layouts" }
  },
  {
    id: "checks", section: "design", title: "Checks",
    body: "Checks looks over the course for problems: holes too close together, throw lines that cross, tees too near another hole, a hole throwing over a road or a building, and more. Click one to see it on the map. Some are just a heads-up.\n\nOpen it with the Problems button in the top bar (it says No problems when there aren't any). On a phone it's in the Design step's panel.\n\nIt also checks the walk between holes. If a basket is more than about 120 ft from the next tee and nothing connects them, it tells you, so you can draw a path or a next-tee route with the Line tool. Paths, roads, bridges and boardwalks all count if they come within about 60 ft of both ends. It also flags walks over 400 ft.\n\nIf a problem is fine, click its eye button to ignore it (that's saved with the course). Ignored brings them back. Safe distance between holes sets how far apart throw lines should be; Auto goes by each hole's length.",
    words: "problems safety issues checks review distance between holes walk path next tee no path ignore",
    path: "Design › Problems (top bar) › Checks",
    where: { step: "design", open: "problems", find: "problems-panel" }
  },
  {
    id: "tools", section: "design", title: "The tool bar",
    body: "The tools are along the bottom of the map: Select (V), Hole (H), Tee (T), Pin (B), Mando (M), Area (O), Line (L), Build (S), Tree (R) and Measure (D). Drop zone (Z), Amenities (A) and Label (K) are under the three dots.\n\nA tool's own choices, like what kind of thing to draw and how, show just above it.",
    words: "tools toolbar draw place more tools three dots",
    path: "Design › tool bar"
  },
  {
    id: "ground", section: "design", title: "Shaping the ground",
    body: "The Ground tool (G) lets you paint the terrain yourself, for the things the elevation data doesn't have: a mound you're building, a tee pad you're leveling, a hole that's been moved. Pick what the brush does, then drag it over the map.\n\nRaise builds the ground up and Lower digs it down. Flatten levels everything you paint to the height where the stroke started, which is handy for tee pads and greens. Smooth evens out bumps and steps but keeps the overall slope. Restore puts the ground back to its height as measured, wherever you've changed it, so you can undo one part of your work without undoing the rest. Holding the brush still keeps it working. The brush is soft at its edge, so what you paint blends into the ground around it instead of leaving a step.\n\nBrush sets how wide it is, and Strength how much each pass does. Each stroke is one Undo. The 3D view, the contour lines and the printed map all follow the new ground. Keep in mind it changes the ground the course is drawn on, not the real survey, so bringing the site in again replaces it.",
    words: "terrain ground elevation sculpt raise lower flatten smooth restore original height reset put back hill mound berm dig level paint brush topography",
    path: "Design › Ground (G)",
    where: { step: "design", find: "ground-raise" }
  },
  {
    id: "areas", section: "design", title: "Areas: OB, hazards, water, woods, rough",
    body: "The Area tool (O) draws a shape. Click its corners and finish with a double-click or Enter, or pick Rectangle, Circle, Freehand or Paint above the tools. Paint works like a real brush: drag it over the map and let go, and the shape comes out with a smooth edge. Set the brush size next to it. Pick its kind (OB, hazard, water, woods, tall grass, parking and so on) before you draw, or change it after in its panel.\n\nThe panel also has its name on the map and a Curved switch. Tall grass can have underbrush too: bushes, briars and weeds growing up through it, set the same way as in woods. It's off until you pick some. Water, parking lots and buildings never have trees in them, so drawing one over trees takes those trees out. That's part of the same change, so one Undo brings them back.",
    words: "area draw polygon rectangle circle freehand paint brush water woods grass rough tall grass underbrush weeds briars hazard parking building",
    path: "Design › Area (O)"
  },
  {
    id: "woods", section: "design", title: "Woods",
    body: "A woods area is a patch of trees, drawn with the Area tool. Its panel decides what grows in it: which trees, how many, and whether there's brush underneath.\n\nWhen the site has measured trees, Trees in these woods picks where its trees come from. Real trees keeps the ones the aerial survey found, at their real size and spot, except where a fairway cuts through. Real trees plus fill-in keeps those, and lets you draw patches where the app plants extra trees, for spots the survey missed or that have grown in since. Planted by the app ignores the survey here and plants its own from the mix settings. No trees clears it out, real ones included.\n\nThe import sets woods where the survey saw very few trees to Real trees plus fill-in for you. Without measured trees, the mix settings show straight away: Pines, Bushes, Density and how tall the trees get. Click any single tree to change just that one. The measured trees in a wood go with it: pull its edge in past a tree and that tree is gone, push the edge back out and it comes back, and deleting the wood takes its trees with it. A tree out on its own, in no wood, stays put.\n\nUnderbrush adds bushes, thickets, briars or weeds under the trees, and it stays off fairways and paths. You can give part of the woods its own amount with Draw a section with its own underbrush, and Thicker at the edges piles it up around the outside.",
    words: "woods trees forest underbrush briars thicket density pines bushes real trees fill-in planted by the app no trees patch measured drawn",
    path: "Design › pick a woods area",
    where: { step: "design", pick: "woods", find: "inspector" }
  },
  {
    id: "lines", section: "design", title: "Lines: paths, roads, streams, OB lines, walks",
    body: "The Line tool (L) draws a line by clicks (double-click or Enter to finish) or freehand. Its kind is what it is: an OB line, a walking path, a next-tee route, a road, a fence or a stream.\n\nPaths and next-tee routes have a surface (dirt, gravel, wood chips, mown grass or paved). A stream can be wider in places by dragging its handles. Remove a stretch cuts a piece out of a line. Nothing draws the walk between holes for you, so draw a path or a next-tee route where players should go. Checks tells you where one's missing.\n\nNo tree stands on a road, path, walk or stream, so drawing one over trees takes those trees out, in the same Undo step.\n\nA fence stands up in 3D along its line, so you see it from the tee. Pick what it is in its panel (posts and rails, boards, or chain link you can see through) and how tall it is. On the 2D map it stays a line.",
    words: "line path road stream creek walk walking path next-tee route surface fence remove a stretch fence chain link boards rails height 3d",
    path: "Design › Line (L)"
  },
  {
    id: "build", section: "design", title: "Build: bridges, boardwalks, stairs, walls, buildings",
    body: "The Build tool (S) puts things up. A bridge goes from one bank to the other. Boardwalks, stairs and walls are drawn by points, and buildings, shelters and decks as a rectangle (or by their corners).\n\nTheir panel sets the kind, size, height, roof and colors. Nothing grows inside anything you build, so trees standing there are taken out when you draw it. One Undo brings them back.",
    words: "bridge boardwalk stairs wall building shelter deck structure roof gazebo pavilion",
    path: "Design › Build (S)"
  },
  {
    id: "trees", section: "design", title: "Trees",
    body: "The Tree tool (R) plants a Leafy tree, a Pine or a Bush wherever you click. Pick one to change its species, height, spread, branches, trunk, leaves and lean. New shape grows a different tree of the same species, and Reset puts it back to its species' own shape.\n\nRight-click a tree (hold on a phone) to cut it down, or to edit a measured tree. Trees never stand in a building, on a road or path, or in water. Draw one of those over trees and the trees go, as part of the same change.",
    words: "tree plant species pine bush height spread lean cut down edit measured tree",
    path: "Design › Tree (R)",
    where: { step: "design", pick: "tree", find: "tree-settings" }
  },
  {
    id: "amenities", section: "design", title: "Amenities and labels",
    body: "Amenities (A) are the bits around the course: benches, trash cans, tee signs, kiosks, restrooms, parking, drinking water, practice baskets and so on. Labels (K) put your own words on the map. Both show on the printed map. They're under the three dots in the tool bar.",
    words: "bench trash can sign kiosk restroom parking label text amenity",
    path: "Design › Amenities (A), Label (K)"
  },
  {
    id: "measure", section: "design", title: "Measure",
    body: "The Measure tool (D) checks distances so you don't have to guess. Click a start point, then click anywhere to see the distance and the climb from there.\n\nThe start stays put, so every click after it measures from the same spot. That's handy for checking one tee against a few basket spots. Shift+click adds a turn instead, to measure along a path. Esc, or picking another tool, ends it.",
    words: "measure distance ruler length elevation climb",
    path: "Design › Measure (D)"
  },
  {
    id: "tee-basket", section: "design", title: "Tee pads and baskets",
    body: "A tee or basket opens inside its hole's panel, under Tees and baskets. A tee sets its color (the skill level it's for) and the pad's width, length and surface. If you've turned the pad by hand, Face down the hole again straightens it out.\n\nA basket sets its pin letter and how high it's raised off the ground, for a basket up on a slope or a platform.",
    words: "tee pad surface concrete turf basket pin raised height",
    path: "Design › pick a tee or basket",
    where: { step: "design", pick: "tee", find: "inspector" }
  },
  {
    id: "my-location", section: "design", title: "Where you are (your location)",
    body: "The locate button by the zoom buttons puts you on the map as a blue dot, kept up to date as you walk. Under the dot it says how far you are from the basket of the hole you've picked (or the one you're closest to).\n\nThe pale circle is how sure the phone is, and the little fan is the way you're facing. While the button's filled in, the map follows you and the screen stays awake. Move the map yourself and it stops following; tap the button to follow again, and once more to turn it off. A grey dot means the readings are old or weak.\n\nPhones are usually good to 10 or 15 feet in the open, worse under heavy trees or next to buildings. Give it a few seconds. It needs the site brought in, and a secure (https) page.",
    words: "gps location blue dot live follow me where am i track accuracy compass heading distance to basket udisc",
    path: "The map › locate button",
    where: { step: "design", find: "locate-me" }
  },
  {
    id: "tee-here", section: "phone", title: "Tee and basket where you stand",
    body: "If you're out walking the course, you can drop tees and baskets right where you're standing. Turn on your location first (the locate button), then start a new hole.\n\nThe bar at the bottom says Tap the map, or Tee here. Stand on the tee spot and tap Tee here, then hold still a few seconds while it gets a good fix. Walk to the basket spot and tap Basket here. The Tee and Pin tools work the same way, with Tee here and Pin here. Tapping the map still works too.",
    words: "gps walk lay out stake new hole tee here basket here pin here standing location phone",
    path: "Design › New hole › Tee here"
  },
  {
    id: "gps", section: "design", title: "Put it where you're standing (GPS)",
    body: "Out on the course with a phone, you can move a tee, a basket or anything else to where you're standing. Pick it, then tap Put it where I'm standing.\n\nThe phone listens for about ten seconds, keeps the better readings, and shows how sure it is and how far the thing would move. Move it here puts it there.",
    words: "gps location phone standing on site stake out",
    path: "Design › pick a tee or basket › Put it where I'm standing"
  },
  {
    id: "edit-actions", section: "design", title: "Copy, duplicate, lock and delete",
    body: "Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste where the pointer is, and Ctrl+D duplicates. Right-click something (hold on a phone) for its menu. Lock in place keeps it from getting moved by accident, and Delete removes it.\n\nRight-click open ground on the Design step for things you can start there: a tee or pin for the hole you're on, a bend in its line, a new hole, or measuring from that spot.",
    words: "copy paste duplicate lock delete right click menu",
    path: "Design › right-click a thing"
  },

  // ------------------------------------------------------------------ 3D and views
  {
    id: "2d3d", section: "view", title: "2D and 3D",
    body: "The 2D/3D switch is at the top right of the map (or press 2 and 3). 3D is where you really see what the hills are doing, which isn't always obvious from above.\n\nDrag to pan, scroll or pinch to zoom, and right-drag (or Ctrl+drag) to turn and tilt. Q and E turn, N puts north up, and 0 shows the whole course.",
    words: "2d 3d top down tilt turn rotate zoom pan navigate",
    path: "Design › map › 2D / 3D"
  },
  {
    id: "view-panel", section: "view", title: "The View panel",
    body: "The View button (the layers icon, with the map's buttons at the top right) changes how the map looks while you work. Satellite photo, contour lines, hill shading, ground texture up close, grass blades and wind. That part is just for this device and isn't saved with the course.\n\nStumps where trees were cut shows a stump wherever a measured tree was cut down, so you can click it to bring the tree back. The hole you've picked always shows its stumps.\n\nBelow that is the course's own look, which everyone sees: the landscape and the basket band color. The light belongs to the course map, and its line takes you there.",
    words: "view panel layers satellite photo contours hill shading grass wind stumps where trees were cut landscape season basket band",
    path: "Design › map › View",
    where: { step: "design", open: "view", find: "scene-panel" }
  },
  {
    id: "landscape", section: "view", title: "Landscape (season and region)",
    body: "The landscape sets the colors of the trees, grass and ground everywhere, in 3D and on the printed map. Pick the one that looks like your park: wooded park, open park, pine forest, dry grass, autumn or desert.",
    words: "landscape season autumn fall desert pine dry colors",
    path: "Design › View › Landscape",
    where: { step: "design", open: "view", find: "course-look" }
  },
  {
    id: "tee-view", section: "view", title: "View from the tee",
    body: "You can also stand on one particular tee: pick the tee (a red one, say) and use View from this tee in its panel. Pick a hole and click View from tee (or press Enter). You're standing on the tee looking down the hole, with its par and length. It's a good way to check whether a line is actually throwable.\n\nThe arrow keys (or Previous and Next) go to the other holes, and Back or Esc takes you back to the map. So does going to another step, like Map or Export.",
    words: "tee view first person look from tee",
    path: "Design › a hole › View from tee",
    where: { step: "design", pick: "hole", find: "tee-view" }
  },
  {
    id: "flyover", section: "view", title: "Flyovers",
    body: "Fly over flies from behind the tee down the hole to the basket, like the TV broadcasts do. By default the flyover is Automatic: it works out the flight on its own and steers around the trees.\n\nIf you want more control, switch the hole's Flyover to Keyframes. The keyframes sit on a timeline, numbered. Click one to pick it, or drag it left or right to change when it comes (the ones either side stay put). The picked one gets its own Height, Lens and Time from the keyframe before. + Keyframe adds one after the picked one, right where the flight already goes, and Fly over plays it back.\n\nThe flight goes exactly through each keyframe at the height you set, and moves smoothly from one to the next. It doesn't dodge trees on its own, so if a keyframe sits in a tree's leaves, that's where the camera goes.\n\nYou can do all of it on the map too. Tilt into 3D and each keyframe's camera floats at its height, with the flight drawn where it flies. Drag a camera up or down to raise or lower it, drag the dot on the ground under it to move it, and drag the ring to change where it looks. From straight above, dragging a camera moves it. Click a + between two cameras to add one there. Double-click a camera to look through it.",
    words: "flyover fly over drone camera keyframes broadcast height raise lower 3d drag place timeline lens add keyframe",
    path: "Design › a hole › Fly over",
    where: { step: "design", pick: "hole", find: "hole-flight" }
  },
  {
    id: "fly-camera", section: "view", title: "Flying the camera yourself",
    body: "Camera puts you behind the lens, first person, so you can fly to the shot you want and drop a keyframe right there. It's in a hole's Flyover section and on the bar at the bottom of the view from a tee.\n\nOn a computer, W A S D or the arrow keys move it, Space or E goes up and Q goes down. Hold Shift to go faster. Drag the view to look around, and scroll to zoom the lens. On a phone, the stick in the corner moves it, the arrows on the right take it up and down, and you drag the view to look.\n\nThe keyframes sit in a row along the bottom, in order. Tap one to go to it, and Add keyframe at the end of the row (or Enter) saves where the camera is and where it's pointed, after the one you picked. [ and ] go to the one before or after. Move away from one and Update (or U) moves it to where you are now. Play flies through them, and Done (or Esc) takes you back to the map.",
    words: "camera first person fly drone keyframe wasd keyboard joystick stick add keyframe update look through point",
    path: "Design › a hole › Flyover › Camera",
    where: { step: "design", pick: "hole", find: "fly-camera" }
  },
  {
    id: "camera", section: "view", title: "Flyover settings",
    body: "From a tee, Settings sets how the flyover flies: Camera height, Speed, Field of view, Camera starts behind the tee, Camera off to the side and Camera looks ahead. It also picks the ground (painted map or photo) and what's on screen, like the hole title, the distance and the course's name.\n\nThe settings can be for All holes or just this hole. Apply to holes… copies them to others, and Reset puts the all-holes settings back.",
    words: "camera flyover height speed field of view behind the tee side looks ahead on screen ground painted photo",
    path: "Design › a hole › View from tee › Settings"
  },
  {
    id: "record", section: "view", title: "Record a flyover",
    body: "Record (from a tee, or Export › Flyover video) makes a video of the flight. It records in the background while you keep working. A pill shows how far along it is, and Cancel stops it.",
    words: "record video mp4 webm flyover",
    path: "Design › tee view › Record"
  },

  // ------------------------------------------------------------------ Map
  {
    id: "map-tabs", section: "map", title: "The Map step's tabs",
    body: "General is the stuff every printed page shares: the logo, colors and lettering, and how baskets and OB are marked. Course map, Tee sign, Hole page and Scorecard each show that page with only its own settings.\n\nZoom with the buttons at the top right, or pinch.",
    words: "map step tabs general course map tee sign hole page scorecard",
    path: "Map › tabs",
    where: { step: "map", find: "map-designer" }
  },
  {
    id: "card-style", section: "map", title: "Logo, colors and lettering",
    body: "The course's look on every page: the header color and its lettering, the paper and text colors, and the font for the headings on tee signs, hole pages and the scorecard (any font: the same picker as everywhere). The course logo goes on the scorecard.",
    words: "logo colors lettering font header paper brand",
    path: "Map › General › Logo, colors and lettering",
    where: { step: "map", tab: "general", find: "card-style" }
  },
  {
    id: "marks", section: "map", title: "Marks and colors",
    body: "How baskets are drawn on the printed pages (a basket, a badge, a flag, target rings or the hole number), and the colors for baskets, OB and hazards. PDGA colors swaps in the PDGA's marking colors instead of the map's.",
    words: "basket mark flag number ob color hazard pdga markings",
    path: "Map › General › Marks and colors",
    where: { step: "map", tab: "general", find: "markings" }
  },
  {
    id: "map-style", section: "map", title: "Map style",
    body: "Pick a style for the whole map, like Classic, Golden hour or Storybook. Then change any part of it on its own: Trees, Grass, Fairways, Paths and roads, Water, and Light and shadow.\n\nEach part has its own styles and colors, and Reset puts the style's own back.",
    words: "map style look painted classic golden hour storybook gouache brushwood hollow",
    path: "Map › Course map › Map style",
    where: { step: "map", tab: "map", find: "map-style" }
  },
  {
    id: "map-trees", section: "map", title: "Trees on the map",
    body: "How trees look on the printed map: their style and colors, how many are pines, and where woods get painted (from the photo, everywhere, or only in woods you drew). The painted styles also have the trees' spacing, size and color variety.",
    words: "trees woods pines density spacing tree cover painted",
    path: "Map › Course map › Map style › Trees",
    where: { step: "map", tab: "map", look: "trees", find: "look-part-trees" }
  },
  {
    id: "map-grass", section: "map", title: "Grass, fairways, paths and water",
    body: "Each of these has its own styles and colors. Grass also has tall grass, brightness and texture, and fairways have brightness. For paths and roads, you pick which goes on top where they cross.",
    words: "grass fairway path road water colors brightness texture",
    path: "Map › Course map › Map style",
    where: { step: "map", tab: "map", look: "grass", find: "look-part-grass" }
  },
  {
    id: "light", section: "map", title: "Light and shadow",
    body: "Golden hour, midday or night, where the sun sits (along its real path for your site), how high it gets, and the shadows. The 3D view uses the same light.\n\nTone fine-tunes the picture: brightness, contrast, color strength and how painted it looks. How much the hills stand out is under Elevation.",
    words: "light shadow sun golden hour midday night brightness contrast hills relief tone",
    path: "Map › Course map › Map style › Light and shadow",
    where: { step: "map", tab: "map", look: "light", find: "look-part-light" }
  },
  {
    id: "elevation", section: "map", title: "Elevation on the map",
    body: "Elevation, in the parts of the map under Map style, picks how the painted map shows the ground's shape. The map style stays the same; only the hills and drops are drawn differently.\n\nShaded is soft light and shadow, with bare rock on cliffs. Cliff edges inks the top edge of every drop and puts the wall below it in shadow, so canyons and ledges stand out. Contours draws lines at round heights and writes the heights on them, so you can read how high anything is. Terraces cuts the land into stepped layers, each a bit lighter than the one below. Off draws no elevation at all.\n\nEvery look uses the same sun as the rest of the map, and higher ground throws its shadow across what's below it. Its Hills slider makes any of them stronger or softer.",
    words: "elevation hills hill shading relief canyon cliff cliffs edges contours heights terraces layers steps shading off flat topography slope",
    path: "Map › Course map › Map style › Elevation",
    where: { step: "map", tab: "map", look: "elevation", find: "look-part-elevation" }
  },
  {
    id: "drawn-on-map", section: "map", title: "Drawn on the map",
    body: "Extra lines on the printed map: throw lines, the distances on them, the putting circle, and contour lines. These only change the printed map, not the map you work on. How the hills themselves are drawn is under Elevation.",
    words: "throw lines distances putting circle contour lines",
    path: "Map › Course map › Drawn on the map",
    where: { step: "map", tab: "map", find: "map-style", text: "Drawn on the map" }
  },
  {
    id: "lettering", section: "map", title: "Lettering",
    body: "The map's font, used for its title and labels, and how big the labels are. Click the title on the page to change its words. Every font setting has the same picker: about 1,800 Google fonts plus the app's own. Type part of a name or pick a kind (Good on signs, Sans, Serif, Display, Script). The fonts this course uses and the ones you used lately come first. Point at one and the picked piece shows it before you click. Your printouts carry the fonts with them.",
    words: "font fonts lettering label size google fonts title",
    path: "Map › Course map › Lettering",
    where: { step: "map", tab: "map", find: "fold-title" }
  },
  {
    id: "paper", section: "map", title: "Paper and turning the map",
    body: "The paper size and orientation, the frame around the map (none, a mat, a fine line or a band), and which way the map is turned. Turn to fill the page turns it so the course fills the paper, and North up turns it back.",
    words: "paper size letter tabloid poster a3 a4 orientation landscape portrait frame turn rotate north up",
    path: "Map › Course map › Paper",
    where: { step: "map", tab: "map", find: "fold-paper" }
  },
  {
    id: "printout-editing", section: "map", title: "Laying out a page",
    body: "The course map, tee signs, hole pages and the scorecard all work the same way. Click anything on the page to pick it, and its settings show up in a toolbar right over it: the font, − and + for its size, the lettering and panel colors, bold, italic and how its lines sit for text, how solid it is, and Reset, Duplicate and Hide or Delete. For what you've added, Order brings it to the front or sends it to the back.\n\nDrag a piece to move it. The round handle under it turns it. It snaps to straight and to 45°, and Shift turns it in 15° steps. The angle shows on the toolbar, and a click there straightens it. Pink lines show when it lines up with the page's edges or middle or with another piece, and it snaps there (hold Alt to drag freely). Pull a corner to resize it. Double-click text, or press Enter, to type right on the page. The arrow keys nudge what's picked, and Delete hides it.\n\nAdd, in the panel, puts in text, a picture, a QR code or one of your sponsors. Layers lists everything on the page. Click a name to pick it, and the eye hides it or brings it back. Click the page's background to let go of what's picked.\n\nOn a phone, tap a piece to pick it and its toolbar comes up along the bottom, with Done at its start to let go. Tap the piece again to type its words. Drag it with one finger, and pinch it to make it bigger or smaller. With nothing picked, a drag moves the page, and pinching zooms it. A tap on the background lets go too.\n\nEvery font setting has the same picker: about 1,800 Google fonts plus the app's own. Type part of a name or pick a kind (Good on signs, Sans, Serif, Display, Script). The fonts this course uses and the ones you used lately come first. Point at one and the picked piece shows it before you click. Your printouts carry the fonts with them.",
    words: "lay out layout page editor canva move drag resize snap guides align toolbar font size color bold italic opacity solid see-through transparent turn rotate angle straighten order front back bring send text type hide delete duplicate reset layers add picture qr code phone pinch done deselect",
    path: "Map › any tab",
    where: { step: "map", tab: "sign", find: "print-layers" }
  },
  {
    id: "sponsors", section: "map", title: "Hole sponsors",
    body: "Sponsors, in the panel of every printout, holds the course's hole sponsors. Each one can have a logo, a line of text, or both, and can be on every hole or only the holes you pick.\n\nEach sponsor goes on the page by itself: under Add, click a sponsor's name and drag it where you want it. A sponsor only shows on its own holes, so one layout works for every hole and each sign shows whoever sponsors it.",
    words: "sponsor sponsors logo hole sponsor business advertiser text both several holes place",
    path: "Map › Tee sign › Sponsors",
    where: { step: "map", tab: "sign", find: "print-sponsors" }
  },
  {
    id: "scorecard", section: "map", title: "Scorecard",
    body: "The scorecard prints two to a page: the course's logo or name, lines for the date, par and course, and the score table with each hole's par and each layout's lengths. Set how many players it has rows for.\n\nIts pieces can be moved, sized and restyled like any page's, and anything you add (a QR code to the course page, a sponsor, a line of text) goes on both cards.",
    words: "scorecard score card players rows logo par date qr sponsor",
    path: "Map › Scorecard",
    where: { step: "map", tab: "scorecard", find: "card-settings" }
  },
  {
    id: "tee-signs", section: "map", title: "Tee signs",
    body: "Start from a look (Classic, Trailhead, Field guide or Open view) and pick the sign's size above the page. Then lay it out however you like: every piece of the sign can be moved, sized, restyled or hidden (Laying out a page). Picking another look starts the layout over.\n\nText you add can say {hole}, {par}, {length}, {course} or {name}, and each hole's sign fills in its own, so one layout works for the whole course.\n\nChanges go to every hole. To change one hole's sign, switch Every hole to Hole N only, over the page. Apply to holes… copies a hole's sign to others. The other holes on the sign's map can be faded, hidden or shown.",
    words: "tee sign look classic trailhead field guide open view size every hole this hole only other holes apply",
    path: "Map › Tee sign",
    where: { step: "map", tab: "sign", find: "sign-settings" }
  },
  {
    id: "hole-pages", section: "map", title: "Hole pages and the scorecard",
    body: "Hole page is one page per hole: letter, A4, a 4 × 6 yardage-book card, or a square picture for social media. Pick the size above the preview. Scorecard is the course's card for the layout you're on.\n\nBoth use the General tab's colors and lettering.",
    words: "hole page yardage book card scorecard size square social",
    path: "Map › Hole page, Scorecard",
    where: { step: "map", tab: "page", find: "map-designer" }
  },

  // ------------------------------------------------------------------ Export
  {
    id: "print", section: "export", title: "Print: map, tee signs, scorecard",
    body: "The course map as a PDF, PNG or SVG at the paper size you pick. The tee signs as a PDF, or a ZIP of pictures (each under 5 MB, which is what UDisc takes). The scorecard as a PDF or SVG.\n\n3D picture saves the 3D view as it is right now.",
    words: "print pdf png svg download tee signs hole sheets zip scorecard udisc picture",
    path: "Export › Print",
    where: { step: "export", find: "export-map-pdf" }
  },
  {
    id: "hole-by-hole", section: "export", title: "Hole by hole",
    body: "All the hole pages as one PDF or a ZIP of pictures. Or pick one hole for its page as a PDF, PNG or SVG, plus its GeoJSON.",
    words: "hole pages pdf zip one hole geojson",
    path: "Export › Hole by hole",
    where: { step: "export", find: "hole-exports" }
  },
  {
    id: "video", section: "export", title: "Flyover video",
    body: "Records the whole course in order, or just one hole, at the size and frame rate you pick. It tells you about how long the video will be.\n\nThe camera and what shows on screen are set from a tee, under Camera.",
    words: "video record flyover mp4 resolution fps frame rate",
    path: "Export › Flyover video",
    where: { step: "export", find: "video-record" }
  },
  {
    id: "gps-files", section: "export", title: "GPS and data files",
    body: "KML (for Google Earth), GeoJSON and GPX files with every tee, basket and hole in its real spot. They need the site brought in, since otherwise the app doesn't know where on earth the course is.\n\nSpreadsheets: the holes, and a stake-out list for marking the course on the ground. Below that, the parts list and budget estimates what it'll cost; Change prices if yours are different.",
    words: "gps kml gpx geojson google earth csv spreadsheet stake out parts list prices budget estimate",
    path: "Export › GPS and data",
    where: { step: "export", find: "export-kml" }
  },

  // ------------------------------------------------------------------ Sharing
  {
    id: "live-draft", section: "share", title: "Live or in a draft",
    body: "Publish as I go means your changes go straight into the course. Work in a draft keeps them off to the side until you publish them (or send them to the owner for an OK). The chip in the top bar shows which one you're in, and its menu switches.",
    words: "draft live publish chip publish as i go work in a draft",
    path: "Top bar › Live / Draft", server: true
  },
  {
    id: "save-draft", section: "share", title: "Save draft and history",
    body: "In a draft, name the save (if you want) and click Save draft (or Ctrl+S) to keep a named point in the history. History lists every version. Look at one, Compare it with now, Restore it, or pull it into your draft.",
    words: "save draft history version restore compare",
    path: "Top bar › Draft › History", server: true
  },
  {
    id: "people", section: "share", title: "People",
    body: "Share › People adds someone by their username as a viewer, an editor or an owner. For a viewer, What they see picks which parts of the course they get.\n\nTurn on Need my OK before they go in and editors' drafts come to you for an OK before they change the course.",
    words: "share people invite viewer editor owner role permissions approval need my ok",
    path: "Share › People",
    where: { open: "share-people" }, server: true
  },
  {
    id: "public-links", section: "share", title: "Public links",
    body: "A public link is a course page anyone with the link can see. You pick what it shows (the map, 3D, flyovers, signs, the scorecard, the numbers, downloads), and you can give it its own name, a password and an end date.\n\nYou can turn it off, or give it a new address, any time. The old address stops working.",
    words: "public link share url password expire course page",
    path: "Share › Public link and site",
    where: { open: "share-public" }, server: true
  },
  {
    id: "public-site", section: "share", title: "The public site and how visitors see it",
    body: "The course page shows the version you last published, so click Update site after you change things. This is also where you set how the map and 3D look to visitors: painted or the satellite photo, contour lines and hill shading.\n\nVisitors get your whole course map first, as big as their screen allows, with everything else beside it on a computer, or under it on a phone, where the map stays pinned at the top. Picking a hole in the list or tapping it on the map puts a pool of warm light on it, and the rest of the map stays just as it is. Its row opens with its numbers, its tee sign and Fly over it. Go in close zooms to the hole and All of it zooms back out. Scrolling or pinching zooms anywhere, and the arrow keys go hole to hole.",
    words: "public site update publish visitors painted photo look viewers course page map hole light go in close",
    path: "Share › Public link and site › Public site",
    where: { open: "share-public", find: "public-site-settings" }, server: true
  },
  {
    id: "comments", section: "share", title: "Comments",
    body: "Drop a comment on any spot on the map, or on a tee, basket or anything else (it moves with it). Everyone the course is shared with can see it, reply, and resolve it when it's sorted. Type @ and a name to tell someone.",
    words: "comments notes discuss reply resolve mention",
    path: "Top bar › Comments", server: true
  },
  {
    id: "parks", section: "share", title: "Parks and nearby courses",
    body: "Name the park a course is in, and other courses there show up on the map, with any close calls between their holes. The ground (and the measured trees) can be shared between them, so you only measure it once.",
    words: "park nearby courses other courses share ground",
    path: "Site › Park", server: true
  },

  // ------------------------------------------------------------------ Phone
  {
    id: "phone-layout", section: "phone", title: "The phone layout",
    body: "The steps are along the bottom, and the panel is a sheet. Drag it up for more panel or down for more map, or tap the step again to flip between a short and a taller sheet.\n\nThe tools are a row of buttons at the top of the panel. While you draw, there are Undo, Cancel and Done buttons over the map, since a phone has no Enter or Esc key.",
    words: "phone mobile sheet bottom bar touch"
  },
  {
    id: "gestures", section: "phone", title: "Touch gestures",
    body: "One finger pans the map (or drags whatever you've picked). Pinch to zoom, twist two fingers to turn the map, and slide two fingers up or down to tilt into 3D. Tap picks things, and holding a finger on something opens its menu. With a path, woods or any shape picked, tap one of its corner points and a Delete point button comes up beside it.\n\nHold a finger on open ground for what you can start there: Add a tee here or Add a pin here (for the hole you're on), Bend the hole here, New hole, tee here, or Measure from here.",
    words: "gestures pinch tap hold long press tilt turn twist swipe menu here add a tee here add a pin here bend the hole here measure from here"
  },
  {
    id: "hole-strip", section: "phone", title: "Changing a hole on a phone",
    body: "Tap a hole, a tree, a tee or any other thing, and the panel drops down to a short strip, so the map stays in view above it. Pinch a picked tree, tee or shape with two fingers to size it, and twist to turn it. The strip has Par, Fairway, Tees, Pins, OB and Foliage, each showing what it's set to. Tap one to change it right there.\n\nFor the fairway's width, drag the dial sideways and the map follows as you go. Everything else about the hole is further up, so drag the panel up. The arrows by the hole's name go to the next and previous holes.",
    words: "phone hole strip dial fairway width par tees pins ob foliage edit mobile tree size height pinch twist move here"
  }
];
