// Every feature and setting, once: what it is, what it's for, and where it is. The help guide reads
// it as chapters, and search (Ctrl+K) finds any of it and takes you there.
import type { Step } from "../state/course";
import type { ToolMode } from "../types";

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
  /** A tool to turn on first (its controls show only while it's on). */
  tool?: ToolMode;
  /** The control: its test id (or several, "a|b|c": the first on screen), and within it a row by its words. */
  find?: string;
  /** A sentence to point at it with (Getting started's Show me). */
  say?: string;
  text?: string;
  /** Where it is, said when it can't be pointed at from here ("Design › Ground"). */
  missing?: string;
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
  { id: "start", title: "Getting started", intro: "HyzerLab lays out a disc golf course on the real ground, then makes what the course needs from it: a printed map, tee signs, hole pages, a scorecard, videos and GPS files. You work through four steps, left to right along the top bar (along the bottom on a phone)." },
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
    body: "Getting started is a short list of the main things to do, from finding your park to printing tee signs. It ticks itself off as you do them, in any order, and each one's Show me takes you to the real control and points at it.\n\nDone something another way, or don't need it? Click its circle (tap on a phone) to tick it off yourself, and again to untick it. Close the list with its ×. To bring it back, use the list button at the top (by the ?), the menu on a phone, search, or the Getting started button at the top of this guide. On the Courses page its card has an × too, and Show Getting started under Learn the app puts it back. The card there says how far along you are, the same count as the list. The example course and the walk around it don't tick anything off.",
    words: "getting started tutorial tour checklist learn basics show me around tick off close bring back dashboard courses page",
    path: "The list button at the top · Help › Getting started"
  },
  {
    id: "steps", section: "start", title: "The four steps",
    body: "HyzerLab works in four steps along the top bar (along the bottom on a phone). Site brings in the real place. Design is where you lay out the holes. Map is the printed stuff, and Export makes the files.\n\nYou can jump between them whenever you like. They all work on the same course, so a change in one shows up in the others right away.",
    words: "workflow order site design map export tabs"
  },
  {
    id: "demo-courses", section: "start", title: "Courses and the example course",
    body: "The demo opens on Courses: every course kept in this browser, with the example course, Thunder Hollow, first. Click one to open it. New course starts one of your own, and Open a file brings in a course file.\n\nThunder Hollow is a whole course to look around: 18 holes with their woods, water, paths, signs and maps. Change anything in it. It's your copy, kept here like your own courses, and once you've changed it, its card says Your copy and its circle arrow puts it back as it first was. Undo, in the message that follows, brings your copy back.\n\nA walk around the example (Show me around) takes you through it a stop at a time: the map, a hole, 3D, the view from a tee, the tools, Checks, the printed map and Export. Next and Back (or the arrow keys) go through it, and × or Esc leaves it. The last stop's Start my own course makes a new course and opens Find your park.\n\nThe logo at the top left, or Courses at the top of the course menu (the arrow next to the course's name), brings you back to Courses. A walk around the example is in that menu too. On a phone, both are at the top of the menu, and the walk comes first on Courses, above the courses. Each card shows its par and length, and a small map of its holes.",
    words: "courses home example thunder hollow demo tour walk around show me around start over your copy new course open file",
    path: "The logo › Courses"
  },
  {
    id: "first-course", section: "start", title: "Your first course",
    body: "This gets you from nothing to a printed map. None of it is final, so don't overthink it.\n\nIf you just want to try things without a real place, Start on open ground on the welcome screen skips the Site step. In the demo, New here? Show me around on the welcome screen takes you on a walk around the example course.",
    steps: [
      "On the Site step, click Find your park, search for the park, and frame the area the holes will use. Then click Bring in this site.",
      "On the Design step, press H (or click New hole). Click where the tee goes, then where the basket goes. Keep clicking for the next holes, and press Esc when you're done.",
      "Click a hole to set its par, fairway, OB and notes in its panel.",
      "On the Map step, pick a map style, then show the hole guide and the legend with their eyes in Layers.",
      "On the Export step, download the course map as a PDF, or the tee signs."
    ],
    words: "tutorial begin new course how to start open ground blank"
  },
  {
    id: "pointer", section: "start", title: "Select, move and the pointer",
    body: "The Select tool (V) is the pointer. Click a hole, a tee, an area or a tree to pick it and open its panel. Drag it to move it, or drag its handles to reshape it.\n\nShift+click adds something to the selection or takes it out, and Shift+drag draws a box around several things. The box button, with the map's buttons at the top right (by the zoom buttons on a phone), makes a plain drag draw a box instead of moving the map. Click it again to go back to moving the map. Esc always gets you back to the pointer.",
    words: "select pick move drag handles selection box box button box select"
  },
  {
    id: "undo", section: "start", title: "Undo and redo",
    body: "Undo (Ctrl+Z) takes back your last change, and Redo (Ctrl+Shift+Z) puts it back. The buttons are at the right end of the tool bar.\n\nDragging a slider counts as one change, not one per wiggle, so one Undo puts it back where it started. While you're drawing, Ctrl+Z takes out the last point first, like Backspace. On a phone, Undo and Redo are on the bar at the top.",
    words: "undo redo mistake back ctrl z"
  },
  {
    id: "search", section: "start", title: "Search for anything",
    body: "Press Ctrl+K (or /, or click the magnifier in the top bar) and type what you're after. A hole number, a step, a tool, a name on the map, or a setting like \"fairway width\" or \"tee sign look\". Pick a result and HyzerLab takes you there and points at it.\n\nOn a phone it's Search holes, tools and help, in the menu.",
    words: "find go to search spotlight command palette ctrl k"
  },
  {
    id: "hover", section: "start", title: "What a button does",
    body: "Rest the mouse on a button to see what it does and its key. A dimmed button needs something first. Most of Export's buttons, for example, need at least one hole with a tee and a basket.",
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
    body: "Without an account, your course saves by itself in this browser. It only lives on this computer, though. Clear the browser's site data and it's gone.\n\nTo keep a copy, or move it to another computer, open the course menu (the little arrow next to the course name, or the menu at the top left on a phone) and pick Save as a file. Open a course file… brings it back in.",
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
    body: "This is where you bring in the real place. Search for the park, frame the area the holes will use, and Bring in this site pulls in the photo, the elevation and whatever you ticked. It's a starting point. It has not personally visited your park, so expect some cleanup.\n\nDrag the frame's corners to resize it, or Shift+drag to draw a new one (on a phone, Draw the area or Use this view). The frame can be up to 6,000 ft each way, and its size turns red when it's too big. Under 40 ft each way is too small. Draw the area lights up while it's on; Esc, or the button again, stops it. The search takes a park's name, an address, a lat, lon or a map link.\n\nOnce it's in, What came in, in the Site step's Site section, lists what was brought in. To change the area later, use Resize or re-import the site, and Bring it in again.",
    steps: ["On the Site step, click Find your park.", "Search for the park or an address, and pick it.", "Frame the area the holes will use.", "Tick what to bring in, then click Bring in this site."],
    words: "import address park location satellite resize area frame find your park re-import",
    path: "Site › Find your park (or Resize or re-import the site)",
    where: { step: "site", find: "find-site|welcome-find|resize-site" }
  },
  {
    id: "example-course", section: "site", title: "The example course",
    body: "Thunder Hollow is an example, so there's no real park behind it to bring in. Start your own course makes a new, empty course, and Find your park brings yours in from there.\n\nFind your park still works on the example, but it brings a real park in under the example's holes, which is rarely what you want. The example stays on the Courses page either way.",
    words: "example thunder hollow start your own course find your park",
    path: "Site › Example course",
    where: { step: "site", find: "example-site" }
  },
  {
    id: "place-name", section: "site", title: "Place name",
    body: "The park's name, as the search found it. It's printed on the course map's title and the tee signs, so shorten it to what players call the park.",
    words: "place name park name location printed subtitle",
    path: "Site › Site › Place name",
    where: { step: "site", find: "site-info", text: "Place name" }
  },
  {
    id: "re-import", section: "site", title: "Bring it in again",
    body: "Bringing a site in again replaces everything that came in last time, including any of it you've changed (a road marked OB, a renamed building) and ground you've shaped or painted. Holes and things you drew stay put, on the same spot on the ground, and trees you cut down stay cut. Undo puts it all back.",
    words: "re-import resize bring it in again replace import",
    path: "Site › Resize or re-import the site"
  },
  {
    id: "import-options", section: "site", title: "What comes in with a site",
    body: "These pick what gets pulled in with the site. The more that comes in, the less you have to draw yourself. The elevation always comes in.\n\nUnder the map picks the picture: Satellite photo or Street map. Trees spotted on the satellite photo needs the photo, so it's off with a street map. Real trees and ground (aerial survey) is USGS LiDAR: every tree's spot and height, and the bare ground, measured from the air. It's US only, and only where a survey's been flown. HyzerLab uses the newest one.\n\nTrees spotted on the satellite photo traces woods, trees and water from the picture. It's only used for trees where there's no aerial survey, because the survey is a lot better at it. Paths, roads, water and buildings come from OpenStreetMap, so they're only as good as the local mapping. Buildings it's missing are traced from the air (outlines from Microsoft and others, by way of Overture Maps). They come in shaped like the roof on the photo, and only where the tracing is sure.\n\nIn the US the elevation is fine detail (USGS). Outside the US there's no survey, and the elevation is coarse, about 10 m (33 ft) between readings, so small banks and bumps won't show.",
    words: "lidar usgs aerial survey openstreetmap osm photo trees spotted satellite paths water roads buildings parking options elevation outside us",
    path: "Site › Find your park › Bring in"
  },
  {
    id: "refresh-osm", section: "site", title: "Update paths, roads, water and buildings",
    body: "This asks OpenStreetMap again and swaps in what it has now, along with the buildings traced from the air. Handy if the first import missed something, or someone's fixed the map since.\n\nIt replaces everything that came from OpenStreetMap before, including shapes you've edited since. Things you drew yourself stay put. As on the import, OpenStreetMap's woods don't come back where the measured trees made woods of their own. Undo, in the message, brings the old ones back.",
    words: "openstreetmap osm refresh paths roads water again update buildings",
    path: "Site › Update paths, roads, water and buildings",
    where: { step: "site", find: "refresh-osm" }
  },
  {
    id: "brought-in", section: "site", title: "Brought in automatically",
    body: "This lists what the import added on its own: woods, trees and water traced from the photo, the woods made from the measured trees, the shapes from OpenStreetMap, and the buildings traced from the air. If you'd rather draw your own, Remove all takes a whole group out at once.\n\nTaking out the woods made from the measured trees takes the measured trees standing in them too. Undo, in the message that follows, puts a removed group back.",
    words: "remove imported photo trees osm areas",
    path: "Site › Brought in automatically",
    where: { step: "site", find: "brought-in" }
  },
  {
    id: "lidar", section: "site", title: "Measured trees (LiDAR)",
    body: "Measure trees and ground reads an aerial LiDAR survey of the site. That's a laser scan flown over the land, so you get the real trees (spot, height, crown) and the real shape of the ground under them. It's only in the US, where USGS has flown one.\n\nIt uses the newest survey over the site. If that one barely sees any trees (an old thin scan, or one flown with the leaves off), it tries the next one and keeps whichever saw more. If there's no survey at all, the Site step says No aerial survey here, and Check again looks again.\n\nMeasure again reads it all over, say after resizing the site. It replaces the measured trees and their settings, including the trees you kept or cut. Remove the measured trees takes them all out. Undo brings either back.",
    words: "lidar measure survey trees heights ground usgs remove real trees aerial measure again",
    path: "Site › Real trees and ground",
    where: { step: "site", find: "lidar-info" }
  },
  {
    id: "lidar-settings", section: "site", title: "Measured trees: settings",
    body: "These change how the measured trees are used. You can drop the little ones, grow them up to today, and decide whether the trees where your holes play get cleared.\n\nLeave out trees shorter than hides the measured trees under that height (the count says how many are left). Growth since the survey ages every tree by that many years and fills in some young ones in the gaps and edges. Grow to today sets it to the years since the survey was flown. It's a guess at how much they've grown, so don't expect it to match a fresh survey.\n\nClear trees from the fairways cuts down the measured trees where the holes play. Turn it off to keep them all and cut by hand instead. Bring them back restores saplings and planted trees you cut by hand, and Remove those placed by hand takes out trees you planted right on top of a measured one.",
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
    body: "Down the left side of the map: every hole with its length and par, or what it still needs (Needs a tee, Needs a basket). Click one to pick it and zoom to it. New hole at the bottom starts the hole tool.\n\nWhen you pick something, its panel opens right next to the list, and the list shrinks to just the hole numbers so the rest of the map stays clear. Esc or the X closes it.\n\nWith more than one layout, the layout picker is at the top. The totals at the bottom (holes, par, total length) open the course's own settings. They only show once there's a hole. On a phone, the same list is in the Design step's panel.",
    words: "holes list column totals",
    path: "Design › holes column",
    where: { step: "design", find: "holes-column" }
  },
  {
    id: "new-hole", section: "design", title: "Lay out a hole",
    body: "Press H or click New hole, then click where the tee goes and where the basket goes. That's a hole. The tool stays on, so keep clicking for the next ones, and press Esc when you're done.\n\nHoles number themselves in the order you make them. To change one, type it in the No. box in the hole's panel. Type 3/12 for a hole that's played twice. The color chips above the tool bar set the new tee's color. A basket click right next to the tee (within 10 ft) doesn't make a hole. The tee stays, and you click farther away.",
    words: "new hole add tee basket number",
    path: "Design › New hole (H)",
    where: { step: "design", find: "new-hole" }
  },
  {
    id: "hole-panel", section: "design", title: "A hole's panel",
    body: "Pick a hole and its panel shows its length, how much it climbs or drops, and how long it plays. The buttons under that view it from the tee, fly over it, or zoom the map to it.\n\nFurther down, in order: Par and foliage, then Fairway and line of play (how wide the fairway is, its shape, and the bends in the hole). Add OB puts an OB line along its left or right side or behind the basket. Tees and baskets has a row for each one, and buttons to add another. In play counts the trees on the throw line, says whether OB is in play and shows the elevation profile. Then its name and its notes and hole rules (those print on its tee sign), and its flyover.\n\nThe panel sits on the left, next to the holes. On the Site step it takes over the step's panel instead, with a back arrow to the step.",
    words: "hole inspector panel par notes name length elevation profile in play",
    path: "Design › pick a hole",
    where: { step: "design", pick: "hole", find: "inspector" }
  },
  {
    id: "par", section: "design", title: "Par and foliage",
    body: "Par is worked out for you from how long the hole plays, using the PDGA's par guidelines, until you pick a number. Climbs, doglegs and heavy foliage all make a hole play longer. Foliage says how wooded it is, and Heavy can bump the par up.\n\nAuto foliage goes by the trees in the fairway: about one every 60 ft counts as heavy. Plays like, in the hole's numbers, is the length par is worked out from. Par also depends on the tee color, since longer tees are expected to play longer.",
    words: "par pdga foliage heavy light plays like effective length",
    path: "Design › a hole › Par and foliage",
    where: { step: "design", pick: "hole", find: "inspector", text: "Foliage" }
  },
  {
    id: "fairway", section: "design", title: "Fairway",
    body: "Draw the fairway paints the mown strip from tee to basket, on the map and in 3D. Fairway width sets how wide it is.\n\nTo shape it, pick the hole and drag the squares along the fairway's edges. Each one makes that side wider or narrower there, and holding Shift moves both sides. Double-click a square to get rid of it. Even width puts it back to one width all along.",
    words: "fairway width even shape mown",
    path: "Design › a hole › Draw the fairway",
    where: { step: "design", pick: "hole", find: "inspector", text: "Draw the fairway" }
  },
  {
    id: "line-of-play", section: "design", title: "The line of play: bends and plotting",
    body: "The line of play is the route a throw is meant to take from tee to basket. Bend it to match a dogleg, so the length, par and checks follow the real route instead of a straight line.\n\nBend left and Bend right add a gentle curve, and Straighten takes the bends out. You can also drag the dot halfway along the line to bend it there, drag a turn to move it, or double-click a turn to remove it (on a phone, tap the turn, then Remove this turn). Plot the line lets you click the line out point by point (or drag it freehand), then Done.",
    words: "dogleg bend curve plot line straighten throw line",
    path: "Design › a hole › Plot the line",
    where: { step: "design", pick: "hole", find: "plot-line" }
  },
  {
    id: "tees-pins", section: "design", title: "More tees and pins",
    body: "A hole can have more than one tee and more than one pin. Tees are colored by skill level, and pins are lettered A, B, C and D.\n\nTees and baskets, in the hole's panel, has a row for each one with how long the hole plays from it. Click a row to open its settings right there (it's picked on the map too), and click it again to close it. Clicking a tee or basket on the map does the same thing: you get the hole's panel with that one open, so the hole's settings are never more than a scroll away.\n\nUnder the rows are three buttons. Another tee for this hole starts the Tee tool (T) in a color the hole doesn't have yet. New hole to this basket makes a separate hole, with its own number, that finishes at the same basket: you just place its tee. Another pin position starts the Pin tool (B) for its next letter. Play to another hole's basket instead, folded under them, lets a hole share a basket. Layouts decide which tee and pin each hole is played from.\n\nThe colors the hole already has are dimmed in the chips above the tools. Pick one of those anyway and the new tee goes down in the next color the hole doesn't have, and the hint says which. The Pin tool's hint says which letter comes next.",
    words: "tee pin position another tee basket skill level color share basket tees and baskets",
    path: "Design › a hole › Tees and baskets",
    where: { step: "design", pick: "hole", find: "hole-parts" }
  },
  {
    id: "ob", section: "design", title: "Out of bounds (OB)",
    body: "OB is anywhere a disc that lands costs a penalty throw. You can drop OB beside a hole from its panel, draw OB areas or OB lines, or make the edge of almost anything OB.\n\nIn a hole's panel, Add OB puts an OB line along its Left side, Right side, or Behind basket, ready to tweak with its handles. OB and rules (O) has OB area, an area that's OB inside, and OB line, which is OB on the side away from play.\n\nMost other areas and lines have Out of bounds in their panel. Not OB plays like any other ground. OB, red edge makes it OB and draws a red edge on the map. For just part of it, click Only a stretch, then click where the OB starts and where it ends. Round a closed shape, the stretch goes the way you moved the pointer. Water and streams start out as OB, no red edge: they count as OB, but the map doesn't outline them in red. Hazards, casual areas and out of play have rules of their own, so they don't get this choice.\n\nFor a road, path, fence or stream, OB and beyond makes everything past the line OB too. Out of bounds to the picks which side: Auto (the app's guess, away from the holes) or a side by compass, like East side. OB for limits a line's OB to some holes. OB areas and OB lines have OB for too, and hazards, casual areas and out of play have Counts for.\n\nA hazard is a penalty area that isn't OB: the disc is played where it lies, plus a penalty throw (the PDGA marks hazards yellow). A casual area lets players move their lie out with no penalty (blue). Out of play is somewhere players have to stay out of, like a playground, a garden or private land: the PDGA calls it a required relief area, played like OB but with no penalty.",
    words: "ob out of bounds red line edge stretch only a stretch hazard beyond out of bounds to the side auto not ob counts for ob for casual out of play relief area",
    path: "Design › a hole › Add OB",
    where: { step: "design", pick: "hole", find: "ob-left" }
  },
  {
    id: "mando", section: "design", title: "Mandos and drop zones",
    body: "A mando makes players pass a post or tree on one side. Mando, in OB and rules (or M), puts one on the hole you've picked, and Mando gate puts in two posts players have to throw between. For a single post, its panel sets which side the disc has to pass.\n\nDrop zone, also in OB and rules (or Z), places a drop zone: where players throw from after missing a mando or going OB, when the hole has one. Both belong to a hole, and Belongs to in their panel changes which.",
    words: "mando mandatory gate drop zone dz",
    path: "Design › OB and rules › Mando, Drop zone"
  },
  {
    id: "course-more", section: "design", title: "The course's own settings",
    body: "Click the totals at the bottom of the holes column (Course totals and layouts) for the course's own stuff: its par, total length, walking distance and layouts.\n\nThe walking distance adds up the straight lines from each basket to the next tee, so the real walk is longer.",
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
    body: "Checks looks over the course for problems: holes too close together, throw lines that cross, tees too near another hole, a hole throwing over a road, a building or a shelter, and more. Click one to see it on the map, or click a check's mark on the map (the ! or i) to open Checks with it lit up. Some are just a heads-up.\n\nOpen it with the Checks button in the top bar. It's red when there's a problem, amber for a warning, and plain when there are only heads-ups. It says No problems when there's nothing. The worst are at the top, and holes with a problem or warning get a dot in the holes list. On a phone or tablet, Checks is in the Design step's panel, and its list takes the panel over until you tap the back arrow.\n\nIt also checks the walk between holes. If a basket is more than about 120 ft from the next tee and nothing connects them, it tells you, so you can draw a path or a next-tee route with Paths and roads. Paths, roads, bridges, boardwalks and stairs all count (a wall doesn't) if they come within about 60 ft of both ends. It also flags walks over 400 ft.\n\nIf a problem is fine, click its eye button to ignore it (that's saved with the course). Ignored (n) lists them, and the eye on one brings it back. Safe distance between holes sets how far apart throw lines should be; Auto goes by each hole's length.",
    words: "problems safety issues checks review distance between holes walk path next tee no path ignore",
    path: "Design › Checks (top bar)",
    where: { step: "design", open: "problems", find: "problems-panel" }
  },
  {
    id: "tools", section: "design", title: "The tool bar",
    body: "The tools are along the bottom of the map, named for what you put on the course: Select (V), Hole (H), Tee (T) and Pin (B), then OB and rules (O), Paths and roads (L), Water (W), Trees (R), Grass (U), Build (S), Ground (G) and Measure (D). Amenities (A) and Label (K) are under the three dots.\n\nPick a tool and what it has shows just above it, so you pick what to put down by its own name. OB and rules has OB areas and lines, hazards, casual areas, out of play, mandos and drop zones. Paths and roads has walking paths, next-tee routes, roads and parking lots. Water has ponds and streams. Trees has leafy trees, pines, bushes and woods. Grass has fairways, landing zones, tall grass, and sand or dirt. Build has buildings, shelters, decks, bridges, boardwalks, stairs, walls and fences.\n\nEach is drawn the way it should be: an area by its outline, a path or a fence along its line, a tree or a mando with a click. Each tool picks up where you left off with it. Type a thing's name in Search (Ctrl+K or /) to go straight to it. The ? at the end of a tool's hint opens its page here.\n\nOn the Site step, Hole, Tee, Pin and OB and rules wait under the three dots too. On a phone the tools are a row of buttons at the top of the panel. Swipe it sideways for the rest.",
    words: "tools toolbar draw place more tools three dots ob rules paths roads water grass build fence where is",
    path: "Design › tool bar"
  },
  {
    id: "ground", section: "design", title: "Shaping the ground",
    body: "The Ground tool (G) lets you paint the terrain yourself, for the things the elevation data doesn't have: a mound you're building, a tee pad you're leveling, a hole that's been moved. Pick what the brush does, then drag it over the map. To move the map while you're painting, hold Space and drag (on a phone, use two fingers).\n\nRaise builds the ground up and Lower digs it down. Flatten levels everything you paint to the height where the stroke started, which is handy for tee pads and greens. Smooth evens out bumps and steps but keeps the overall slope. Restore puts the ground back to its height as measured, wherever you've changed it, so you can undo one part of your work without undoing the rest. Holding the brush still keeps it working. The brush is soft at its edge, so what you paint blends into the ground around it instead of leaving a step.\n\nBrush sets how wide it is, and Strength how much each pass does. Each stroke is one Undo. The 3D view, the contour lines and the printed map all follow the new ground. Keep in mind it changes the ground the course is drawn on, not the real survey, so bringing the site in again replaces it.",
    words: "terrain ground elevation sculpt raise lower flatten smooth restore original height reset put back hill mound berm dig level paint brush topography",
    path: "Design › Ground (G)",
    where: { step: "design", tool: "sculpt", find: "ground-raise" }
  },
  {
    id: "areas", section: "design", title: "Areas: OB, hazards, water, woods, rough",
    body: "An area is drawn by its outline: OB, hazards and casual areas under OB and rules, ponds under Water, woods under Trees, fairways and tall grass under Grass, parking under Paths and roads. Click its corners, then click the first corner again (or double-click, or press Enter) to finish. Backspace or Ctrl+Z takes out the last corner. Or pick Rectangle, Circle, Freehand or Paint above the tools. Paint works like a real brush: drag it over the map and let go, and the shape comes out with a smooth edge. Set the brush size next to it. Its kind can be changed after in its panel.\n\nThe panel also has its name on the map and a Curved switch. Tall grass can have underbrush too: bushes, briars and weeds growing up through it, set the same way as in woods. It's off until you pick some. Water, parking lots and buildings never have trees in them, so drawing one over trees takes those trees out. That's part of the same change, so one Undo brings them back.\n\nOB areas, landing zones, parking lots and the like have Turn buttons. Water, woods, tall grass, fairways and sand follow the ground, so they don't. A landing zone is the mown area around a basket, or where a drive should end up. A fairway drawn here is for when the hole's own fairway doesn't fit.",
    words: "area draw polygon rectangle circle freehand paint brush water woods grass rough tall grass underbrush weeds briars hazard parking building",
    path: "Design › OB and rules, Water, Trees, Grass"
  },
  {
    id: "woods", section: "design", title: "Woods",
    body: "A woods area is a patch of trees, drawn with Woods in the Trees tool. Its panel decides what grows in it: which trees, how many, and whether there's brush underneath.\n\nWhen the site has measured trees, Trees in these woods picks where its trees come from. Real trees keeps the ones the aerial survey found, at their real size and spot, except where a fairway cuts through. Real trees plus fill-in keeps those, and lets you draw patches where the app plants extra trees, for spots the survey missed or that have grown in since. Planted by the app ignores the survey here and plants its own from the mix settings. No trees clears it out, real ones included.\n\nThe import sets woods where the survey saw very few trees to Real trees plus fill-in for you. Without measured trees, the mix settings show straight away: Pines, Bushes, Density and how tall the trees get. Click any single tree to change just that one. The measured trees in a wood go with it: pull its edge in past a tree and that tree is gone, push the edge back out and it comes back, and deleting the wood takes its trees with it. A tree out on its own, in no wood, stays put.\n\nUnderbrush adds bushes, thickets, briars or weeds under the trees, and it stays off fairways and paths. You can give part of the woods its own amount with Draw a section with its own underbrush, and Thicker at the edges piles it up around the outside.",
    words: "woods trees forest underbrush briars thicket density pines bushes real trees fill-in planted by the app no trees patch measured drawn",
    path: "Design › pick a woods area",
    where: { step: "design", pick: "woods", find: "inspector" }
  },
  {
    id: "lines", section: "design", title: "Lines: paths, roads, streams, OB lines, walks",
    body: "A line is drawn by clicks (double-click or Enter to finish) or freehand. Walking paths, next-tee routes and roads are under Paths and roads (L), a stream under Water, an OB line under OB and rules, and a fence under Build.\n\nPaths and next-tee routes have a surface (dirt, gravel, wood chips, mown grass or paved). A stream can be wider in places by dragging its handles. Remove a stretch cuts a piece out of a line. Nothing draws the walk between holes for you, so draw a path or a next-tee route where players should go. Checks tells you where one's missing. A next-tee route can have a width too; with none, it's a dashed line on the map. Roads, paths, next-tee routes and streams follow the ground, so they have no Turn buttons. OB lines and fences do.\n\nNo tree stands on a road, path, walk or stream, so drawing one over trees takes those trees out, in the same Undo step.\n\nA fence stands up in 3D along its line, so you see it from the tee. Pick what it is in its panel (posts and rails, boards, or chain link you can see through) and how tall it is. On the 2D map it stays a line.",
    words: "line path road stream creek walk walking path next-tee route surface fence remove a stretch fence chain link boards rails height 3d",
    path: "Design › Paths and roads (L)"
  },
  {
    id: "build", section: "design", title: "Build: bridges, boardwalks, stairs, walls, buildings",
    body: "The Build tool (S) puts things up: buildings, shelters, decks, bridges, boardwalks, stairs, walls and fences. A bridge goes from one bank to the other. Boardwalks, stairs, walls and fences are drawn by points, and buildings, shelters and decks as a rectangle (or by their corners).\n\nTheir panel sets the kind, size, height, roof and colors. Nothing grows inside anything you build, so trees standing there are taken out when you draw it. One Undo brings them back.",
    words: "bridge boardwalk stairs wall fence building shelter deck structure roof gazebo pavilion",
    path: "Design › Build (S)"
  },
  {
    id: "trees", section: "design", title: "Trees",
    body: "The Trees tool (R) plants a Leafy tree, a Pine or a Bush wherever you click, and draws Woods. Pick one to change its species, height and spread. Shape details, folded away under those, has where the branches start, how many branches or limbs, the trunk, the leaves and the lean. New shape grows a different tree of the same species, and Reset puts it back to its species' own shape. It stays the same species.\n\nRight-click a tree (hold on a phone) to cut it down, or to edit a measured tree. Trees never stand in a building, on a road or path, or in water. Draw one of those over trees and the trees go, as part of the same change. A tree standing in a wood gets the tree's menu too, and Select the woods at the bottom picks the wood instead. On a phone, holding a finger on trees gives a row for each: Edit this tree and Cut down this tree.",
    words: "tree plant species pine bush height spread lean cut down edit measured tree",
    path: "Design › Trees (R)",
    where: { step: "design", pick: "tree", find: "tree-settings" }
  },
  {
    id: "amenities", section: "design", title: "Amenities and labels",
    body: "Amenities (A) are the bits around the course: benches, trash cans, tee signs, kiosks, restrooms, parking signs, drinking water, practice baskets and so on. Labels (K) put your own words on the map. Both show on the printed map, and they're under the three dots in the tool bar.\n\nBridges and shelters are built with Build (S), so they're not in the list. One already on a course keeps its sign. After you put a label down, the Select tool comes back and its text is selected in the panel, ready to type over.",
    words: "bench trash can sign kiosk restroom parking label text amenity",
    path: "Design › Amenities (A), Label (K)"
  },
  {
    id: "measure", section: "design", title: "Measure",
    body: "The Measure tool (D) checks distances so you don't have to guess. Click a start point, then click anywhere to see the distance and the climb from there.\n\nWith From one spot, the start stays put, so every click after it measures from the same spot. That's handy for checking one tee against a few basket spots. Along a path adds a turn with each click instead, to measure the way a player walks or a disc flies (Shift+click does the same from one spot). Clear starts over. Esc, or picking another tool, ends it.",
    words: "measure distance ruler length elevation climb",
    path: "Design › Measure (D)"
  },
  {
    id: "tee-basket", section: "design", title: "Tee pads and baskets",
    body: "A tee or basket opens inside its hole's panel, under Tees and baskets. A tee sets its color (the skill level it's for), the pad's width, length and surface, and Turn. A hole has one tee of each color, so picking a color another of its tees has swaps the two. If you've turned the pad by hand, Face down the hole again straightens it out.\n\nA basket sets its pin letter and how high it's raised off the ground, for a basket up on a slope or a platform. Picking a letter another of its pins has swaps those two as well.",
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
    body: "Out on the course, you can move a tee, a basket or anything else to where you're standing. On a phone, turn on your location with the locate button, pick the thing, then tap Move here. Hold still a few seconds while the phone gets a good fix. The dot on the button is green within 10 ft, amber within 25 and red past that. Undo puts it back.\n\nOn a tablet, it's Move it here in the thing's panel. The tablet listens for about ten seconds, keeps the better readings, and shows how sure it is and how far the thing would move. Move it puts it there.",
    words: "gps location phone standing on site stake out move here move it here",
    path: "Design › pick a tee or basket › Move here"
  },
  {
    id: "edit-actions", section: "design", title: "Copy, duplicate, lock and delete",
    body: "Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste where the pointer is (with the pointer off the map, Ctrl+V puts it next to the original), and Ctrl+D duplicates. Right-click something (hold on a phone) for its menu. Lock in place keeps it from getting moved by accident, and Delete removes it.\n\nRight-click open ground on the Design step for things you can start there: a tee or pin for the hole you're on, a bend in its line, a new hole, or measuring from that spot.\n\nRight-click a hole's line for Bend the hole here, and a tee for View from this tee. With several things picked, More (or holding one) has Lock all and Unlock all. A locked thing's panel says so, and its Turn buttons stay hidden until you unlock it.",
    words: "copy paste duplicate lock delete right click menu",
    path: "Design › right-click a thing"
  },

  // ------------------------------------------------------------------ 3D and views
  {
    id: "2d3d", section: "view", title: "2D and 3D",
    body: "The 2D/3D switch is at the top right of the map (or press 2 and 3). 3D is where you really see what the hills are doing, which isn't always obvious from above.\n\nDrag to pan (or hold Space and drag, whatever tool you're using), scroll or pinch to zoom, and right-drag (or Ctrl+drag) to turn and tilt. Q and E turn, N puts north up, and 0 shows the whole course.",
    words: "2d 3d top down tilt turn rotate zoom pan navigate",
    path: "Design › map › 2D / 3D"
  },
  {
    id: "view-panel", section: "view", title: "The View panel",
    body: "The View button (the layers icon, with the map's buttons at the top right) changes how the map looks while you work. The top part is on this screen only and isn't saved with the course: Satellite photo, contour lines, hill shading, ground texture up close, grass blades and wind. More grass blades look better up close but can slow the 3D view on a phone or an older computer; Auto picks for the device. From a tee, Satellite photo is swapped for Ground: the painted map or the photo, which flyover videos use too.\n\nStumps where trees were cut shows a stump wherever a measured tree was cut down, so you can click (or tap) it to bring the tree back. The hole you've picked always shows its stumps.\n\nBelow that is the course's look, which everyone sees: the landscape and the basket band color. The light belongs to the course map, and its line takes you there.",
    words: "view panel layers satellite photo contours hill shading grass wind stumps where trees were cut landscape season basket band",
    path: "Design › map › View",
    where: { step: "design", open: "view", find: "scene-panel" }
  },
  {
    id: "landscape", section: "view", title: "Landscape (season and region)",
    body: "The landscape sets the colors of the trees, grass and ground everywhere, in 3D and on the printed map. Pick the one that looks like your park: wooded park, open park, pine forest, dry grass, autumn or desert. It also sets the printed map's colors for trees, grass, fairways, paths and water, and how many trees are pines. If that's not what you wanted, Undo on the message puts them back.",
    words: "landscape season autumn fall desert pine dry colors",
    path: "Design › View › Landscape",
    where: { step: "design", open: "view", find: "course-look" }
  },
  {
    id: "tee-view", section: "view", title: "View from the tee",
    body: "Pick a hole and click View from the tee, or press Enter. You're standing on the tee looking down the hole, with its par and length. It's a good way to check whether a line is actually throwable.\n\nTo stand on one particular tee, pick that tee (a red one, say) and use View from this tee in its panel, or pick it and press Enter.\n\nThe arrow keys (or Previous and Next) go to the other holes, and Back or Esc takes you back to the map. So does going to another step, like Map or Export.",
    words: "tee view first person look from tee",
    path: "Design › a hole › View from the tee",
    where: { step: "design", pick: "hole", find: "tee-view" }
  },
  {
    id: "flyover", section: "view", title: "Flyovers",
    body: "Fly over flies from behind the tee down the hole to the basket, like the TV broadcasts do. By default the flyover is Automatic: it works out the flight on its own and steers around the trees.\n\nIf you want more control, switch the hole's Flyover to Keyframes. The keyframes sit on a timeline, numbered. Click one to pick it, or drag it left or right to change when it comes (the ones either side stay put). The picked one gets its own Height, Lens and Time from the keyframe before. + Keyframe adds one after the picked one, right where the flight already goes, and Fly over plays it back. Switching back to Automatic removes the keyframes, and Undo brings them back.\n\nThe flight goes exactly through each keyframe at the height you set, and moves smoothly from one to the next. It doesn't dodge trees on its own, so if a keyframe sits in a tree's leaves, that's where the camera goes.\n\nYou can do all of it on the map too. Tilt into 3D and each keyframe's camera floats at its height, with the flight drawn where it flies. Drag a camera up or down to raise or lower it, drag the dot on the ground under it to move it, and drag the ring to change where it looks. From straight above, dragging a camera moves it. Click a + between two cameras to add one there. Double-click a camera to look through it.\n\nWhile it flies, the button says Stop, and Esc stops it and leaves you on the tee (Esc again goes back to the map). If the flight is still waiting on its pictures, Cancel on the loading screen stops it.",
    words: "flyover fly over drone camera keyframes broadcast height raise lower 3d drag place timeline lens add keyframe",
    path: "Design › a hole › Fly over",
    where: { step: "design", pick: "hole", find: "hole-flight" }
  },
  {
    id: "fly-camera", section: "view", title: "Flying the camera yourself",
    body: "Camera puts you behind the lens, first person, so you can fly to the shot you want and drop a keyframe right there. It's in a hole's Flyover section and on the bar at the bottom of the view from a tee.\n\nOn a computer, W A S D or the arrow keys move it, Space or E goes up and Q goes down. Hold Shift to go faster. Drag the view to look around, and scroll to zoom the lens. On a phone, the stick in the corner moves it, the arrows on the right take it up and down, and you drag the view to look.\n\nThe keyframes sit in a row along the bottom, in order. Tap one to go to it, and Add keyframe at the end of the row (or Enter) saves where the camera is and where it's pointed, after the one you picked. [ and ] go to the one before or after. Move away from one and Update (or U) moves it to where you are now. Play flies through them, and Done (or Esc) takes you back to the map. The lens goes from 15° (zoomed in) to 110° (wide). A flight needs two keyframes, so with exactly two the trash button stays off; Update moves one instead.",
    words: "camera first person fly drone keyframe wasd keyboard joystick stick add keyframe update look through point",
    path: "Design › a hole › Flyover › Camera",
    where: { step: "design", pick: "hole", find: "fly-camera" }
  },
  {
    id: "camera", section: "view", title: "Flyover settings",
    body: "From a tee, Settings sets how the flyover flies: Camera height, Speed, Lens, Camera starts behind the tee, Camera off to the side and Camera looks ahead. It also picks the ground (painted map or photo) and what shows while it flies, like the big title at the start, the hole number in the corner, the distance and the course's name. What's on screen applies from the tee as well, so turning off the throw line or OB hides it there too. The same settings are in a hole's Flyover section, under Camera and what's on screen. A hole with keyframes takes its height and where it starts from them, so those settings don't show for it.\n\nThese settings are for picks All holes or just this hole. From a tee they start on All holes, unless the hole has settings of its own. Use the all-holes settings drops a hole's own, so it flies like the rest again. Apply to holes… copies them to others, and Reset puts the all-holes settings back.",
    words: "camera flyover height speed field of view behind the tee side looks ahead on screen ground painted photo lens zoom wide",
    path: "Design › a hole › View from the tee › Settings"
  },
  {
    id: "record", section: "view", title: "Record a flyover",
    body: "Record (from the tee, or Export › Flyover video) makes a video of the flight. It records in the background while you keep working. A pill says what it's doing (painting the map, sharpening a hole, recording each hole) and how far along it is, and Cancel stops it.",
    words: "record video mp4 webm flyover",
    path: "Design › tee view › Record"
  },

  // ------------------------------------------------------------------ Map
  {
    id: "map-tabs", section: "map", title: "The Map step's tabs",
    body: "General is the stuff every printed page shares: the logo, colors and lettering, the course name's font, and how baskets and OB are marked. While you're on General, the page shows a tee sign, since that's where most of it goes. Course map, Tee sign, Hole page and Scorecard each show that page with only its own settings.\n\nZoom with the buttons at the top right, Ctrl and the mouse wheel, or a pinch. The wheel on its own scrolls the page.",
    words: "map step tabs general course map tee sign hole page scorecard",
    path: "Map › tabs",
    where: { step: "map", find: "map-designer" }
  },
  {
    id: "card-style", section: "map", title: "Logo, colors and lettering",
    body: "The course's look on the tee signs, hole pages and the scorecard: the header color and its lettering, the paper and text colors, and the headings font. The course map has its own colors under Course map. Course name font sets the course's name on every page, the map too.\n\nLeft as Each look's own, the course's name keeps the font each look uses: the map's labels font on the map, the Classic signs and the scorecard, and the headings font on the other looks and the hole pages. Any font works, from the same picker as everywhere. Big hole numbers stay clear of the words over them in any font, even a tall, narrow one.\n\nLine under the course name is the small line under it on the map and the signs (Disc golf course, unless you change it). Clear it for none. The course logo goes on the scorecard.",
    words: "logo colors lettering font header paper brand course name font title line under tagline",
    path: "Map › General › Logo, colors and lettering",
    where: { step: "map", tab: "general", find: "card-style" }
  },
  {
    id: "marks", section: "map", title: "Marks and colors",
    body: "Marking colors comes first: Map colors (red OB, purple out of play) or PDGA colors (white OB, red out of play). Then how baskets are drawn on the printed pages (a basket, a badge, a flag, target rings or the hole number), and the colors for baskets, OB and hazards. PDGA colors always use white for OB, so the OB color goes away while they're on, and the keys on signs and hole pages show OB white too.",
    words: "basket mark flag number ob color hazard pdga markings",
    path: "Map › General › Marks and colors",
    where: { step: "map", tab: "general", find: "markings" }
  },
  {
    id: "map-style", section: "map", title: "Map style",
    body: "Pick a style for the whole map, like Classic, Golden hour or Storybook. Then change any part of it on its own: Trees, Grass, Fairways, Paths and roads, Water, and Light and shadow.\n\nEach part has its own styles and colors, and Reset puts the style's own back. Reset all does that for every part at once, light and elevation included.",
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
    body: "Golden hour, midday or night, where the sun sits (along its real path for your site), how high it gets, and the shadows. The 3D view uses the same sun: where it shines from, how high it is and how dark the shadows are. Night only changes the printed map. The 3D view stays in daylight.\n\nTone fine-tunes the picture: brightness, contrast, color strength and how painted it looks. How much the hills stand out is under Elevation. Reset under Light and shadow puts the style's light back, Tone included.",
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
    body: "Extra lines on the printed map: throw lines, the distances on them, the putting circle (10 m, 33 ft), and contour lines. These only change the printed map, not the map you work on. How the hills themselves are drawn is under Elevation.",
    words: "throw lines distances putting circle contour lines",
    path: "Map › Course map › Drawn on the map",
    where: { step: "map", tab: "map", find: "drawn-on-map" }
  },
  {
    id: "lettering", section: "map", title: "Lettering",
    body: "Font is for the map's labels, and Label size is how big they are. The course's name has a font of its own, Course name font on the General tab, because it goes on every printed page. Click the title on the page to change its words or its font.\n\nEvery font setting has the same picker: about 1,800 Google fonts plus the app's own. Type part of a name or pick a kind (Good on signs, Sans, Serif, Display, Script). The fonts this course uses and the ones you used lately come first. Point at one and the picked piece shows it before you click. On a phone, tap fonts one after another to try them on the page, then tap Done. Your printouts carry the fonts with them.",
    words: "font fonts lettering label size google fonts title title font heading",
    path: "Map › Course map › Lettering",
    where: { step: "map", tab: "map", find: "fold-title" }
  },
  {
    id: "paper", section: "map", title: "Paper and turning the map",
    body: "The paper size and orientation, the frame around the map (none, a mat, a fine line or a band), and which way the map is turned. The paper size is also over the page, beside the tabs. Turn to fill the page turns it so the course fills the paper, and North up turns it back.",
    words: "paper size letter tabloid poster a3 a4 orientation landscape portrait frame turn rotate north up",
    path: "Map › Course map › Paper",
    where: { step: "map", tab: "map", find: "fold-paper" }
  },
  {
    id: "printout-editing", section: "map", title: "Laying out a page",
    body: "The course map, tee signs, hole pages and the scorecard all work the same way. Click anything on the page to pick it, and its settings show up in a toolbar right over it. It offers only what that piece has: the font, − and + for its size, the lettering and panel colors, bold, italic and how its lines sit for text, how solid it is, and Reset, Duplicate and Hide or Delete.\n\nIn front or behind brings what you added forward or sends it back. On the course map, text moves among the other text and pictures among the other pictures. The × beside the panel color takes the panel off. On a sign or a hole page, ⋯ holds the words of a heading the look prints, like HOLE NOTES or THE GREEN: change them, or clear them for none.\n\nDrag a piece to move it. The round handle under it turns it. It snaps to straight and to 45°, and Shift turns it in 15° steps. The angle shows on the toolbar, and a click there straightens it. Pink lines show when it lines up with the page's edges or middle or with another piece, and it snaps there (hold Alt to drag freely). Pull a corner to resize it, or use − and +, which keep its middle where it is. A scale bar is the one thing that can't be resized: it can be moved and turned, but it always shows true distance. On a tee sign or hole page it changes with the hole picture when that's resized.\n\nDouble-click text, or press Enter, to type right on the page. Enter finishes, Shift+Enter starts a new line where the words can have one, and Esc leaves them as they were. On signs and pages that works for the course name, the hole's name and notes, the designer and the place name too, and the change shows everywhere they do. A hole with no notes gets none on its sign or page. On the course map, the title's second line is the place's name until you type your own, and deleting it takes it off. The arrow keys nudge what's picked, Delete hides a piece of the look and deletes what you added, and Ctrl+D duplicates what you added.\n\nAdd, in the panel, puts in text, a picture, a QR code or a sponsor. Text on a sign or page can say {hole}, {par}, {length}, {course} or {name} (the hole's name), and each hole fills in its own. A new QR code opens its link to type straight away, and the page says Add a link over it until it has one. Layers lists everything on the page. Click a name to pick it, and the eye hides it or brings it back. A piece that isn't on this page says why, and one that's only on other holes takes you to one of them. Click the page's background to let go of what's picked.\n\nWhat you add to tee signs and hole pages goes on every hole. With Hole N only picked over the page, a new piece goes on that hole alone, and a piece that's on every hole says so under its toolbar. The flag button in the toolbar picks the holes it's on.\n\nOn a phone, the page's own settings are a row of tools under it, each opening a short panel. Tap a piece to pick it and its toolbar takes the row's place, with Done at its start to let go. A setting that needs more room, like how solid it is, opens in a short panel over the toolbar. Tap the piece again to type its words: Enter starts a new line where it can, and Done finishes. Drag it with one finger from anywhere on it, and pinch it to make it bigger or smaller. A finger snaps it to the page's middle and to the middles of other pieces. A tap anywhere off it lets go, and the next tap picks. With nothing picked, a drag moves the page, and pinching zooms it.\n\nFonts work the same everywhere: see Lettering.",
    words: "lay out layout page editor canva move drag resize snap guides align toolbar font size color bold italic opacity solid see-through transparent turn rotate angle straighten order front back bring send text type hide delete duplicate reset layers add picture qr code phone pinch done deselect heading holes flag hole only panel bold",
    path: "Map › any tab",
    where: { step: "map", tab: "sign", find: "print-layers" }
  },
  {
    id: "sponsors", section: "map", title: "Hole sponsors",
    body: "Sponsors, under Add in the panel of every printout, holds the course's hole sponsors. Each one can have a logo, a line of text, or both, and can be on every hole or only the holes you pick.\n\nOn tee signs and hole pages, Hole sponsor puts in one piece that shows whoever sponsors each hole, side by side under a small heading you can retype. It sits in the same place on every hole, so one layout works for the whole course. To place one sponsor by itself, click its name under Your sponsors and drag it where you want it. It only shows on its own holes. Removing a sponsor takes it off every page too.",
    words: "sponsor sponsors logo hole sponsor business advertiser text both several holes place",
    path: "Map › Tee sign › Add › Sponsors",
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
    body: "Start from a look (Classic, Trailhead, Field guide or Open view) and pick the sign's size above the page. Signs on letter or A4 paper always use Classic, and the look you pick goes on the other sizes. Then lay it out however you like: every piece of the sign can be moved, sized, restyled or hidden (Laying out a page). Picking another look starts the layout over, every hole's own changes too.\n\nText you add can say {hole}, {par}, {length}, {course} or {name} (the hole's name), and each hole's sign fills in its own, so one layout works for the whole course.\n\nChanges go to every hole. To change one hole's sign, switch Changes go to, over the page, from Every hole to Hole N only. Apply to holes… then gives that hole's own sign to the holes you pick. From Every hole, Put holes back to the every-hole sign… does that for the holes you pick. The other holes on the sign's map can be faded, hidden or shown, and How much they show sets how faded. A wide sign in Classic, Trailhead or Field guide has an extra panel: the green up close, the hole's numbers, or none.",
    words: "tee sign look classic trailhead field guide open view size every hole this hole only other holes apply",
    path: "Map › Tee sign",
    where: { step: "map", tab: "sign", find: "sign-settings" }
  },
  {
    id: "hole-pages", section: "map", title: "Hole pages and the scorecard",
    body: "Hole page is one page per hole: Letter, A4, a 4 × 6 in yardage book card, or a square picture for social media. Pick the size above the page. Start from picks the look: Everything, or Just the hole (its picture across the page and its number, the rest a click away in Layers). Picking another look starts every page over.\n\nChanges go to every hole or, with Hole N only over the page, to that hole's page alone. Apply to holes… gives one hole's own page to others, and Put holes back to the every-hole page… undoes that for the holes you pick. Scorecard is the course's card for the layout you're on.\n\nBoth use the General tab's colors and lettering.",
    words: "hole page yardage book card scorecard size square social",
    path: "Map › Hole page, Scorecard",
    where: { step: "map", tab: "page", find: "page-settings" }
  },

  // ------------------------------------------------------------------ Export
  {
    id: "print", section: "export", title: "Print: map, tee signs, scorecard",
    body: "PDF is for printing, PNG for the web, and SVG for editing in Illustrator or Inkscape. The course map comes at the paper size you pick. The tee signs come as a PDF, or a ZIP of pictures (each under 5 MB, which is what UDisc takes), and Cancel stops them partway. The scorecard is a PDF or SVG. Each one says when it's saved.\n\nPicture of the 3D view saves the 3D view the way you left it on the Design step, at 1920 × 1080. Hole labels aren't in it.\n\nA QR code with no link yet gets a heads-up when you print what it's on.",
    words: "print pdf png svg download tee signs hole sheets zip scorecard udisc picture",
    path: "Export › Print",
    where: { step: "export", find: "export-map-pdf" }
  },
  {
    id: "hole-by-hole", section: "export", title: "Hole by hole",
    body: "All the hole pages as one PDF or a ZIP of pictures. Or pick one hole for its page as a PDF, PNG or SVG, plus its GeoJSON. Picking a hole shows its page in the preview. Its GeoJSON needs the site brought in, the same as the other GPS files.",
    words: "hole pages pdf zip one hole geojson",
    path: "Export › Hole by hole",
    where: { step: "export", find: "hole-exports" }
  },
  {
    id: "video", section: "export", title: "Flyover video",
    body: "Records the whole course in order, or just one hole, at the size and frame rate you pick. It tells you about how long the video will be.\n\nThe ground (painted map or photo) is right here, and it's the same setting as the one in the view from the tee. The camera and what shows on screen are set in the view from the tee, under Settings. A hole with keyframes flies through them instead.\n\nRecording takes longer than the video itself, more so at 4K or 60 fps. You can keep working while it records, and the progress says what it's on: painting the map, sharpening a hole, then recording each one.",
    words: "video record flyover mp4 resolution fps frame rate",
    path: "Export › Flyover video",
    where: { step: "export", find: "video-record" }
  },
  {
    id: "gps-files", section: "export", title: "GPS and data files",
    body: "KML (for Google Earth), GeoJSON and GPX files with every tee, basket and hole in its real spot. They need the site brought in, since otherwise the app doesn't know where on earth the course is.\n\nSpreadsheets: the holes, and a stake-out list for marking the course on the ground. Below that, the parts list and budget estimates what it'll cost. Change prices if yours are different (OB stakes and mando signs are in there too).\n\nSave the course file puts the whole course in one file, photo and terrain included. Open it again with Open a course file… in the course menu, or send it to someone.",
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
    body: "A public link is a course page anyone with the link can see. You pick what it shows (the map, 3D, flyovers, signs, the scorecard, the numbers, downloads), and you can give it its own name, a password and an end date. A named link is easy to guess, so add a password if only some people should see it.\n\nYou can turn it off, or give it a new address, any time. The old address stops working.",
    words: "public link share url password expire course page",
    path: "Share › Public link and site",
    where: { open: "share-public" }, server: true
  },
  {
    id: "public-site", section: "share", title: "The public site and how visitors see it",
    body: "The course page shows the version you last published, so click Update site after you change things. What viewers see, in the share box, sets how the map and 3D look to visitors and to people who can only view: painted or the satellite photo, contour lines and hill shading. Click Update site after you change it.\n\nVisitors get your whole course map first, as big as their screen allows, with everything else beside it on a computer, or under it on a phone, where the map stays pinned at the top. Picking a hole in the list or tapping it on the map puts a pool of warm light on it, and the rest of the map stays just as it is. Its row opens with its numbers, its tee sign and Fly over it. Go in close zooms to the hole and All of it zooms back out. Scrolling or pinching zooms anywhere, and the arrow keys go hole to hole.",
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
    body: "Name the park a course is in, and other courses there show up on the map, with any close calls between their holes. The ground (and the measured trees) can be shared between them, so you only measure it once. Sharing the ground leaves each course's holes, OB and drawings as they are, and a tree cut down on one course stays on the others.",
    words: "park nearby courses other courses share ground",
    path: "Site › Park", server: true
  },

  // ------------------------------------------------------------------ Phone
  {
    id: "phone-layout", section: "phone", title: "The phone layout",
    body: "The steps are along the bottom, and the panel is a sheet. Drag it up for more panel or down for more map, or tap the step again to flip between a short and a taller sheet.\n\nThe tools are a row of buttons at the top of the panel. Undo and Redo are on the bar at the top, so they're always there, whatever step you're on and whatever is picked. On a tablet they're on the bar down the side. Tapping something on the map leaves the map where it is; picking a hole from the list zooms to it, and Zoom to it in a thing's menu does too. The View button is with the map's buttons on the right, in 2D and 3D, and 2D and 3D hide on Map and Export, where the page covers the map. On the Map step there's no sheet: the page has the screen, and its settings are a row of tools under it (Style, Drawn, Lettering, Paper, Add and Layers, or the ones for the printout you're on). A tool opens just that setting in a short panel, and the page shrinks to stay whole above it. Done closes it.\n\nWhile you draw, there are Undo, Cancel and Done buttons over the map, since a phone has no Enter or Esc key. That Undo takes back the last point. Half way through a rectangle or circle, the bar says where to tap next, and Cancel drops it.",
    words: "phone mobile sheet bottom bar touch"
  },
  {
    id: "gestures", section: "phone", title: "Touch gestures",
    body: "One finger pans the map (or drags whatever you've picked). Pinch to zoom, twist two fingers to turn the map, and slide two fingers up or down to tilt into 3D. Tap picks things, and holding a finger on something opens its menu. With a path, woods or any shape picked, tap one of its corner points and a Delete point button comes up beside it. With a hole picked, tap a turn in its line for Remove this turn, a fairway width square for Remove point, or the end of a walk for Reset walk. A stream's width square gives Reset width. Tap a flyover keyframe to pick it, tap it twice to look through it, and tap a + between two to add one. On a big shape, like woods, a pond or a road, the corner points thin out when you're zoomed out. Zoom in to see them all. The box button by the zoom buttons makes a drag draw a box around things; a bar says so, and Done turns it off.\n\nHold a finger on open ground for what you can start there: Add a tee here or Add a pin here (for the hole you're on), Bend the hole here, New hole, tee here, or Measure from here.",
    words: "gestures pinch tap hold long press tilt turn twist swipe menu here add a tee here add a pin here bend the hole here measure from here"
  },
  {
    id: "hole-strip", section: "phone", title: "Changing things on a phone",
    body: "Tap a hole, a tree, a tee or any other thing, and the panel drops down to a short strip, so the map stays in view above it. Pinch a picked tree or tee with two fingers to size it, and twist to turn it. A shape that turns (an OB area, a landing zone, anything built) does the same while it's small on screen. On woods, water, grass, roads, paths and streams two fingers move the map. The strip has Par, Fairway, Tees, Pins, OB and Foliage, each showing what it's set to. Tap one to change it right there.\n\nFor the fairway's width, drag the dial sideways and the map follows as you go. Everything else about the hole is further up, so drag the panel up. The arrows by the hole's name go to the next and previous holes.\n\nA tree gets Height, Spread, Kind and Lean, a tee gets Color, Facing and its pad's size, and a shape gets its kind, width and OB.",
    words: "phone hole strip dial fairway width par tees pins ob foliage edit mobile tree size height pinch twist move here"
  }
];
