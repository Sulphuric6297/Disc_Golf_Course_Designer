// Every feature and setting, once: what it is, what it's for, and where it is. The help guide reads
// it as chapters, and search (Ctrl+K) finds any of it and takes you there.
import type { Step } from "../state/course";

export type GuideSection = "start" | "site" | "design" | "view" | "map" | "export" | "share" | "phone" | "keys";

/** Where a setting is: the step and tab, what to open, and the control to point at. */
export interface Where {
  step?: Step;
  tab?: "general" | "map" | "sign" | "page" | "scorecard";
  /** A part of the map style to open (Map step, Course map tab). */
  look?: "trees" | "grass" | "fairway" | "paths" | "water" | "light";
  /** A panel or popover to open first. */
  open?: "view" | "course" | "problems" | "share-public" | "share-people";
  /** A thing to pick first (its panel holds the setting). */
  pick?: "hole" | "tee" | "basket" | "woods" | "water" | "line" | "tree" | "structure" | "walk";
  /** The control: its test id, and within it a row by its words. */
  find?: string;
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
  { id: "start", title: "Getting started", intro: "HyzerLab lays out a disc golf course on the real ground, then makes everything the course needs: a printed map, tee signs, hole pages, a scorecard, videos and GPS files. You work through four steps, left to right along the top bar." },
  { id: "site", title: "Site", intro: "The Site step brings in the real place: the satellite photo, the ground's elevation, the trees and the paths, roads and water around it." },
  { id: "design", title: "Design", intro: "The Design step is the course itself, on the map: holes, tees and baskets, OB, mandos, paths, trees and everything else that stands there. Pick anything to change it in its panel." },
  { id: "view", title: "3D, tee views and flyovers", short: "3D and flyovers", intro: "The map is one view in 2D and 3D. Look at a hole from its tee, fly over it, and record the flight as a video." },
  { id: "map", title: "Map: the printed course map, signs and cards", short: "Map", intro: "The Map step designs what is printed: the course map, the tee signs, the hole pages and the scorecard. The tabs at the top pick which one you see; the panel shows only that one's settings." },
  { id: "export", title: "Export", intro: "The Export step makes the files: PDFs and pictures to print, videos, and GPS and spreadsheet files for the course crew." },
  { id: "share", title: "Saving, sharing and working together", short: "Sharing", intro: "On a HyzerLab server the course is saved as you go, with its history. Share it with people, work in drafts, and publish a public course page." },
  { id: "phone", title: "On a phone or tablet", short: "Phone and tablet", intro: "Everything works by touch. On a phone the steps are along the bottom and the panel is a sheet you pull up and down." },
  { id: "keys", title: "Keyboard shortcuts", intro: "Most tools have a key. Press ? any time to open this guide." }
];

export const TOPICS: Topic[] = [
  // ------------------------------------------------------------------ Getting started
  {
    id: "steps", section: "start", title: "The four steps",
    body: "Site brings in the place. Design lays out the holes and everything on the course. Map designs the printed map, tee signs, hole pages and scorecard. Export makes the files.\n\nYou can go back to any step at any time: everything you change shows up in the others at once.",
    words: "workflow order site design map export tabs"
  },
  {
    id: "first-course", section: "start", title: "Your first course",
    body: "From an empty start to a printed map in a few minutes.",
    steps: [
      "Site: search for the park and frame the area the holes will use, then Bring in this site.",
      "Design: press H (or New hole), click where the tee goes, then where the basket goes. Keep clicking for the next holes; Esc when done.",
      "Pick a hole to set its par, fairway, OB and notes in its panel.",
      "Map: pick a map style and show the hole guide and legend.",
      "Export: download the course map as a PDF, or the tee signs."
    ],
    words: "tutorial begin new course how to start"
  },
  {
    id: "pointer", section: "start", title: "Select, move and the pointer",
    body: "The pointer (V) picks things: click a hole, a tee, an area or a tree to see its panel on the right. Drag to move it, or drag its handles to reshape it. Shift+click adds to the selection; Shift+drag draws a box around several things.\n\nEsc always goes back to the pointer.",
    words: "select pick move drag handles selection box"
  },
  {
    id: "undo", section: "start", title: "Undo and redo",
    body: "Undo (Ctrl+Z) takes back the last change, and Redo (Ctrl+Shift+Z) puts it back. Dragging a slider is one step, not one per move. The buttons are at the right end of the tool bar.",
    words: "undo redo mistake back ctrl z"
  },
  {
    id: "search", section: "start", title: "Search for anything",
    body: "Press Ctrl+K (or /, or the magnifier in the top bar) and type: a hole number, a step, a tool, a name on the map, or any setting, like \"walk width\" or \"tee sign look\". Pick a result and HyzerLab takes you there and points at it.",
    words: "find go to search spotlight command palette ctrl k"
  },
  {
    id: "hover", section: "start", title: "What a button does",
    body: "Rest the mouse on any button to see what it is and its key. Dimmed buttons say why they're off nearby (for example Export's buttons need a hole with a tee and a basket).",
    words: "tooltip hover icon label"
  },
  {
    id: "save-local", section: "start", title: "Saving (in this browser)",
    body: "Without an account, your work keeps by itself in this browser. To move it to another computer or keep a copy, use the course menu (the arrow by the course name): Save as a file, and Open a file.",
    words: "save file open download backup",
    path: "Top bar › course name › menu", server: false
  },
  {
    id: "save-server", section: "start", title: "Saving (on the server)",
    body: "The course saves itself a moment after each change; the chip in the top bar shows Live or Draft and a dot while it saves. Ctrl+S saves at once. If a save fails it says Not saved: click it to try again.",
    words: "save autosave ctrl s not saved",
    server: true
  },

  // ------------------------------------------------------------------ Site
  {
    id: "find-site", section: "site", title: "Find and bring in the site",
    body: "Search for the park or an address, then frame the area the holes will use: drag the frame's corners, or Shift+drag to draw a new one. Keep it under the size shown. Bring in this site fetches the photo, the elevation, and what you ticked below.",
    steps: ["Site step: Find your site.", "Search, pick the place, and frame the area.", "Pick what to bring in, then Bring in this site."],
    words: "import address park location satellite resize area frame",
    path: "Site › Find your site (or Resize or re-import the site)",
    where: { step: "site", find: "site-info" }
  },
  {
    id: "import-options", section: "site", title: "What comes in with a site",
    body: "Satellite photo: the picture under the map (or a street map instead). Trees and ground from LiDAR: real tree heights and bare ground measured from the air (USGS), where it's been flown. Trees found on the photo: woods traced from the picture. Paths, water, roads and parking: from OpenStreetMap.",
    words: "lidar usgs openstreetmap osm photo trees paths water roads parking options",
    path: "Site › Find your site › options"
  },
  {
    id: "refresh-osm", section: "site", title: "Update paths, roads and water",
    body: "Fetches OpenStreetMap again and replaces what came from it before (not what you drew). Undo brings the old ones back.",
    words: "openstreetmap osm refresh paths roads water again",
    path: "Site › Update paths, roads and water",
    where: { step: "site", find: "refresh-osm" }
  },
  {
    id: "brought-in", section: "site", title: "Brought in automatically",
    body: "Lists what the import made by itself: areas and trees found on the photo, and OpenStreetMap's paths and water. Remove all takes a whole group out at once, if you'd rather draw your own.",
    words: "remove imported photo trees osm areas",
    path: "Site › Brought in automatically",
    where: { step: "site", find: "photo-found" }
  },
  {
    id: "lidar", section: "site", title: "Measured trees (LiDAR)",
    body: "Measure trees and ground reads the survey for the site: each tree's spot, height and crown, and the bare ground. Measure again after resizing the site. Remove the measured trees takes them all out.",
    words: "lidar measure survey trees heights ground usgs remove",
    path: "Site › Real trees and ground",
    where: { step: "site", find: "lidar-info" }
  },
  {
    id: "lidar-settings", section: "site", title: "Measured trees: settings",
    body: "Smallest tree kept leaves out the short ones. Grown since the survey adds the years since it was flown (Grow to today fills in the right number) and seedlings in the clearings. Cut trees off the fairways clears the measured trees where the holes play; turn it off to keep them, cutting by hand.\n\nTrees cut down by hand can be brought back here, and trees you placed that stand on a measured one can be removed.",
    words: "smallest tree grown years saplings grow today cut fairways clear trees",
    path: "Site › Real trees and ground › Measured trees",
    where: { step: "site", find: "lidar-settings" }
  },
  {
    id: "course-info", section: "site", title: "Course name, designer and units",
    body: "The course's name (also in the top bar), the designer (on the signs and the map's credits), and whether distances are in feet or meters.",
    words: "name designer feet meters units distances",
    path: "Site › Course",
    where: { step: "site", find: "side-panel", text: "Distances in" }
  },

  // ------------------------------------------------------------------ Design
  {
    id: "holes-column", section: "design", title: "The holes column",
    body: "Down the map's left side: every hole with its length and par. Click one to pick it and zoom to it. New hole starts the hole tool. The totals at the foot (holes, par, length) open the course's own settings.",
    words: "holes list column totals",
    path: "Design › holes column",
    where: { step: "design", find: "holes-column" }
  },
  {
    id: "new-hole", section: "design", title: "Lay out a hole",
    body: "Press H or New hole, click where the tee goes, then where the basket goes. The tool stays on for the next hole. Holes number themselves in order; type a hole's number in its panel to change it (1/2 for a hole played twice).",
    words: "new hole add tee basket number",
    path: "Design › New hole (H)",
    where: { step: "design", find: "new-hole" }
  },
  {
    id: "hole-panel", section: "design", title: "A hole's panel",
    body: "Pick a hole to see its numbers (length, elevation change, plays-like length), its par and what's in play. Name it, write its notes and rules (they go on its tee sign), and see the trees on its fairway.",
    words: "hole inspector panel par notes name length elevation",
    path: "Design › pick a hole",
    where: { step: "design", pick: "hole", find: "inspector" }
  },
  {
    id: "par", section: "design", title: "Par and foliage",
    body: "Par is set from the hole's effective length, by the PDGA's table, unless you pick one. Foliage (light or heavy) makes a hole play longer: heavy foliage raises its plays-like length and par. Auto decides from the trees in the fairway.",
    words: "par pdga foliage heavy light plays like effective length",
    path: "Design › a hole › Par and play",
    where: { step: "design", pick: "hole", find: "inspector", text: "Foliage" }
  },
  {
    id: "fairway", section: "design", title: "Fairway",
    body: "Draw the fairway shows the mown path from tee to basket on the map and in 3D. Set its width, or turn off Even width to shape it: wider or narrower along the way, pulled to a side.",
    words: "fairway width even shape mown",
    path: "Design › a hole › Draw the fairway",
    where: { step: "design", pick: "hole", find: "inspector", text: "Draw the fairway" }
  },
  {
    id: "line-of-play", section: "design", title: "The line of play: bends and plotting",
    body: "Bend left and Bend right curve the hole's line; Straighten undoes it. Drag the dot halfway along the line to add a dogleg, and double-click a dogleg to remove it. Plot the line lets you click the line out point by point (or drag it freehand), then Done.",
    words: "dogleg bend curve plot line straighten throw line",
    path: "Design › a hole › Plot the line",
    where: { step: "design", pick: "hole", find: "plot-line" }
  },
  {
    id: "tees-pins", section: "design", title: "More tees and pins",
    body: "A hole can have several tees (by color: skill level) and pin positions (A, B, C). T adds another tee and B another pin, for the hole picked. Layouts pick which tee and pin each hole plays.",
    words: "tee pin position another tee basket skill level color",
    path: "Design › a hole › Tees and pins",
    where: { step: "design", pick: "hole", find: "inspector", text: "Tees and pins" }
  },
  {
    id: "ob", section: "design", title: "Out of bounds (OB)",
    body: "From a hole's panel, Add OB on the left, right or behind the basket. Draw OB areas with the Area tool (O, kind OB), or OB lines with the Line tool. A line or water can be marked OB in its panel, along all of it or just a stretch, and for some holes only.",
    words: "ob out of bounds red line stretch hazard",
    path: "Design › a hole › Add OB",
    where: { step: "design", pick: "hole", find: "ob-left" }
  },
  {
    id: "mando", section: "design", title: "Mandos and drop zones",
    body: "M places a mando on the hole picked (one post, or a gate of two posts); its panel says which side the disc must pass. Z places a drop zone. Both belong to a hole.",
    words: "mando mandatory gate drop zone dz",
    path: "Design › tools › Mando (M), Drop zone (Z)"
  },
  {
    id: "course-more", section: "design", title: "The course's own settings",
    body: "Click the totals at the foot of the holes column: the course's par, length and walking distance, its layouts, and its walks.",
    words: "totals course popover layouts walks",
    path: "Design › holes column › totals",
    where: { step: "design", open: "course", find: "course-more" }
  },
  {
    id: "layouts", section: "design", title: "Layouts",
    body: "A layout plays each hole from one tee color to one pin (Main from the blue tees to pin A, say; Long from the gold tees to pin B). Add a layout in Edit layouts. With more than one, pick the one you're working on at the top of the holes column: its tees and pins stand out on the map while the other layouts' shrink to faint dots, new tees and holes take its color, and the lengths, par, tee signs and scorecard follow it. A hole with no tee of its color plays from the nearest one; its panel offers to add one.",
    words: "layout tees pins main red blue gold long short active switch which",
    path: "Design › totals › Edit layouts",
    where: { step: "design", open: "course", find: "course-more", text: "Edit layouts" }
  },
  {
    id: "walks", section: "design", title: "Walks to the next hole",
    body: "The walk from each basket to the next tee is drawn by itself, as a path on the ground. Here: turn them off, set every walk's width, or Edit the walks to drag them where people really walk. A hole's own walk (its width, surface, or none) is in its panel.",
    words: "walk next tee path walking width edit",
    path: "Design › totals › Walks to the next hole",
    where: { step: "design", open: "course", find: "auto-walks" }
  },
  {
    id: "checks", section: "design", title: "Checks",
    body: "The Checks button (top bar) lists problems: holes too close to each other, crossing lines of play, tees behind baskets and more, each shown on the map. Ignore one that's fine (it's kept with the course); Ignored brings it back. Safe distance between holes sets how close is too close.",
    words: "problems safety issues checks review distance between holes",
    path: "Design › Checks",
    where: { step: "design", open: "problems", find: "problems-panel" }
  },
  {
    id: "tools", section: "design", title: "The tool bar",
    body: "Along the bottom: Select (V), New hole (H), Tee (T), Pin (B), Mando (M), Area (O), Line (L), Build (S), Tree (R), Amenities (A), Measure (D), and more behind the three dots. A tool's own choices (what kind, how to draw) show just above it.",
    words: "tools toolbar draw place",
    path: "Design › tool bar"
  },
  {
    id: "areas", section: "design", title: "Areas: OB, hazards, water, woods, rough",
    body: "The Area tool (O) draws a shape: click its corners and Done, or pick Rectangle, Circle or Freehand above the tools. Its kind (OB, hazard, water, woods, tall grass, parking…) is set before or after in its panel, with its name on the map.",
    words: "area draw polygon rectangle circle freehand water woods hazard",
    path: "Design › Area (O)"
  },
  {
    id: "woods", section: "design", title: "Woods",
    body: "A woods area grows trees inside it: its mix of pines and bushes, how thick, and how tall. With measured trees it can keep them (Measured), fill in patches you draw (Filled in), use generated trees only, or none. Underbrush adds thickets, briars or weeds, thicker at the edges if you like.",
    words: "woods trees forest underbrush briars thicket density pines bushes",
    path: "Design › pick a woods area",
    where: { step: "design", pick: "woods", find: "inspector" }
  },
  {
    id: "lines", section: "design", title: "Lines: paths, roads, streams, OB lines, walks",
    body: "The Line tool (L) draws a line by clicks (double-click or Enter to finish) or freehand. Its kind sets how it looks; paths and walks have a surface (dirt, gravel, paved), and a stream can be wider in places.",
    words: "line path road stream creek walk surface",
    path: "Design › Line (L)"
  },
  {
    id: "build", section: "design", title: "Build: bridges, boardwalks, stairs, walls, buildings",
    body: "The Build tool (S) draws structures: a bridge from bank to bank, boardwalks, stairs and walls by points, buildings, shelters and decks as rectangles. Their panel sets the kind, size, height, roof and colors.",
    words: "bridge boardwalk stairs wall building shelter deck structure roof",
    path: "Design › Build (S)"
  },
  {
    id: "trees", section: "design", title: "Trees",
    body: "The Tree tool (R) plants a leafy tree, a pine or a bush. Pick one to set its species, height, spread, branches, trunk, leaves and lean; New shape grows another of the same species, and Reset its own shape again.",
    words: "tree plant species pine bush height spread lean",
    path: "Design › Tree (R)",
    where: { step: "design", pick: "tree", find: "tree-settings" }
  },
  {
    id: "amenities", section: "design", title: "Amenities and labels",
    body: "Amenities (A): benches, trash cans, tee signs, kiosks, restrooms, parking, water, practice baskets. Labels (K) put words on the map. Both show on the printed map.",
    words: "bench trash can sign kiosk restroom parking label text",
    path: "Design › Amenities (A), Label (K)"
  },
  {
    id: "measure", section: "design", title: "Measure",
    body: "The Measure tool (D): click a start point, then click anywhere: the distance and the climb from the start. The start stays put, so each click after it measures from the same spot (handy for checking a tee to several basket spots); a faint line shows where the next click would reach. Shift+click adds a turn instead, to measure along a path. Esc, or another tool, ends it.",
    words: "measure distance ruler length",
    path: "Design › Measure (D)"
  },
  {
    id: "tee-basket", section: "design", title: "Tee pads and baskets",
    body: "A tee's panel: its color (skill level), the pad's size and surface, and Face down the hole again after turning it. A basket's panel: its pin position (A, B, C), how high it stands, and which holes play to it.",
    words: "tee pad surface concrete turf basket pin raised height",
    path: "Design › pick a tee or basket",
    where: { step: "design", pick: "tee", find: "inspector" }
  },
  {
    id: "gps", section: "design", title: "Put it where you're standing (GPS)",
    body: "On the course with a phone: pick a tee, basket or anything else, and Put it where I'm standing. The phone listens for about ten seconds, keeps its best readings and shows how close it is; Move it here puts it there.",
    words: "gps location phone standing on site stake out",
    path: "Design › pick a tee or basket › Put it where I'm standing"
  },
  {
    id: "edit-actions", section: "design", title: "Copy, duplicate, lock and delete",
    body: "Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste where the pointer is; Ctrl+D duplicates. Right-click (or hold on a phone) for a thing's menu. Lock keeps it from moving by accident. Delete removes it.",
    words: "copy paste duplicate lock delete right click menu",
    path: "Design › right-click a thing"
  },

  // ------------------------------------------------------------------ 3D and views
  {
    id: "2d3d", section: "view", title: "2D and 3D",
    body: "The 2D/3D switch (top right of the map, or keys 2 and 3). Drag to pan, scroll or pinch to zoom, right-drag (or Ctrl+drag) to turn and tilt. Q and E turn, N puts north up, 0 shows the whole course.",
    words: "2d 3d top down tilt turn rotate zoom pan navigate",
    path: "Design › map › 2D / 3D"
  },
  {
    id: "view-panel", section: "view", title: "The View panel",
    body: "The View button, with the map's buttons at the top right. The top part is this device's view while you work (not saved with the course): the satellite photo, contour lines, hill shading, ground texture up close, grass blades and wind, and the stumps of cut trees.\n\nBelow it, the course's own look that everyone sees: the landscape (season and region) and the basket band's color. The light is the course map's: its line there takes you to it.",
    words: "view panel layers satellite photo contours hill shading grass wind stumps landscape season basket band",
    path: "Design › map › View",
    where: { step: "design", open: "view", find: "scene-panel" }
  },
  {
    id: "landscape", section: "view", title: "Landscape (season and region)",
    body: "Park, autumn, pine forest, dry grass, desert and more: the colors of the trees, grass and ground everywhere, on the 3D view and the printed map.",
    words: "landscape season autumn fall desert pine dry colors",
    path: "Design › View › Landscape",
    where: { step: "design", open: "view", find: "course-look" }
  },
  {
    id: "tee-view", section: "view", title: "View from the tee",
    body: "Pick a hole and View from tee (or Enter): you stand on the tee looking down the hole, with its par and length. The arrows or [ and ] go to the other holes; Back returns to the map.",
    words: "tee view first person look from tee",
    path: "Design › a hole › View from tee",
    where: { step: "design", pick: "hole", find: "tee-view" }
  },
  {
    id: "flyover", section: "view", title: "Flyovers",
    body: "Fly over flies from behind the tee down the hole to the basket, like a TV broadcast. A hole flies by itself, or through keyframes you set (each one's spot, height and view) in the hole's panel under Flyover.",
    words: "flyover fly over drone camera keyframes broadcast",
    path: "Design › a hole › Fly over",
    where: { step: "design", pick: "hole", find: "hole-flight" }
  },
  {
    id: "camera", section: "view", title: "Camera settings",
    body: "From a tee, Camera: the flight's height, speed, field of view, where it starts and how far it looks ahead, the ground (painted map or photo), and what shows on screen (hole title, distance, the course's name, lines). Settings for All holes, or this hole only; Apply to holes gives them to others.",
    words: "camera flyover height speed field of view on screen ground painted photo",
    path: "Design › a hole › View from tee › Camera"
  },
  {
    id: "record", section: "view", title: "Record a flyover",
    body: "Record (from a tee, or Export › Flyover video) makes a video of the flight. It records on its own while you keep working; the progress shows in a pill, and Cancel stops it.",
    words: "record video mp4 webm flyover",
    path: "Design › tee view › Record"
  },

  // ------------------------------------------------------------------ Map
  {
    id: "map-tabs", section: "map", title: "The Map step's tabs",
    body: "General holds what every printed page shares: the logo, colors and lettering, and the marks and colors for baskets and OB. Course map, Tee sign, Hole page and Scorecard each show that page and only its own settings. Zoom with the buttons at the top right, or pinch.",
    words: "map step tabs general course map tee sign hole page scorecard",
    path: "Map › tabs",
    where: { step: "map", find: "map-designer" }
  },
  {
    id: "card-style", section: "map", title: "Logo, colors and lettering",
    body: "The course's look on every page: the header color and its lettering, paper and text colors, the headings' font, and the course logo (on the scorecard).",
    words: "logo colors lettering font header paper brand",
    path: "Map › General › Logo, colors and lettering",
    where: { step: "map", tab: "general", find: "card-style" }
  },
  {
    id: "marks", section: "map", title: "Marks and colors",
    body: "How baskets are drawn (a basket, a flag, a number…), and the colors of baskets, OB and hazards. PDGA colors uses the PDGA's marking colors instead of the map's.",
    words: "basket mark flag number ob color hazard pdga markings",
    path: "Map › General › Marks and colors",
    where: { step: "map", tab: "general", find: "markings" }
  },
  {
    id: "map-style", section: "map", title: "Map style",
    body: "Pick a style for the whole map (Classic, Brushwood, Hollow, Golden hour, Storybook, Gouache), then change any part of it on its own: Trees, Grass, Fairways, Paths and roads, Water, and Light and shadow. Each part has its own styles and colors; Reset puts the style's own back.",
    words: "map style look painted classic golden hour storybook gouache brushwood hollow",
    path: "Map › Course map › Map style",
    where: { step: "map", tab: "map", find: "map-style" }
  },
  {
    id: "map-trees", section: "map", title: "Trees on the map",
    body: "The trees' style and colors, how many are pines, where to paint woods (from the photo, everywhere, or only in woods you drew) and how full they are; in painted styles also the trees' spacing, size and color variety.",
    words: "trees woods pines density spacing tree cover painted",
    path: "Map › Course map › Map style › Trees",
    where: { step: "map", tab: "map", look: "trees", find: "look-part-trees" }
  },
  {
    id: "map-grass", section: "map", title: "Grass, fairways, paths and water",
    body: "Each has its own styles and colors. Grass: tall grass, brightness and texture. Fairways: brightness. Paths and roads: which goes over which where they cross.",
    words: "grass fairway path road water colors brightness texture",
    path: "Map › Course map › Map style",
    where: { step: "map", tab: "map", look: "grass", find: "look-part-grass" }
  },
  {
    id: "light", section: "map", title: "Light and shadow",
    body: "Golden hour, midday or night; where the sun is (along its real path for the site) and how high at midday; the shadows. Tone fine-tunes the picture: brightness, contrast, color strength, how painted it looks, and the hills' relief. The 3D view uses the same light.",
    words: "light shadow sun golden hour midday night brightness contrast hills relief tone",
    path: "Map › Course map › Map style › Light and shadow",
    where: { step: "map", tab: "map", look: "light", find: "look-part-light" }
  },
  {
    id: "drawn-on-map", section: "map", title: "Drawn on the map",
    body: "Throw lines, the distances on them, the putting circle, contour lines and hill shading, on the printed map only.",
    words: "throw lines distances putting circle contour lines hill shading",
    path: "Map › Course map › Drawn on the map",
    where: { step: "map", tab: "map", find: "map-style", text: "Drawn on the map" }
  },
  {
    id: "lettering", section: "map", title: "Lettering",
    body: "The map's font and how big its labels are. The title's words are edited on the page: pick the title.",
    words: "font lettering label size",
    path: "Map › Course map › Lettering",
    where: { step: "map", tab: "map", find: "fold-title" }
  },
  {
    id: "paper", section: "map", title: "Paper and turning the map",
    body: "The frame around the map (none, a mat, a fine line, a band), the paper size and orientation, and the map's turn: Turn to fill the page turns it so the course fills the paper; North up turns it back.",
    words: "paper size letter tabloid poster a3 orientation landscape portrait frame turn rotate north up",
    path: "Map › Course map › Paper",
    where: { step: "map", tab: "map", find: "fold-paper" }
  },
  {
    id: "on-the-page", section: "map", title: "On the page: title, hole guide, legend and more",
    body: "Everything on the printed page, listed under On the page: the title, hole guide, legend, north arrow, scale bar and credits. The eye shows or hides one. Click one (or on the page) to pick it: drag to move it, its corners to resize it, and set its words and colors in the panel. Back in place puts it where it was. Add text and Add picture put your own on the page.",
    words: "title subtitle hole guide legend north arrow scale bar credits text picture image move resize hide",
    path: "Map › Course map › On the page",
    where: { step: "map", tab: "map", find: "page-elements" }
  },
  {
    id: "tee-signs", section: "map", title: "Tee signs",
    body: "Pick the sign's look (Classic, Trailhead, Field guide, Open view) and its size above the preview. Set what's on it: the other holes faded, hidden or shown, each part on or off, and what goes under the notes (the course map, the green, the hole's numbers). Settings for all holes, or one hole only; Apply to holes copies them.",
    words: "tee sign look classic trailhead field guide open view size parts other holes",
    path: "Map › Tee sign",
    where: { step: "map", tab: "sign", find: "sign-settings" }
  },
  {
    id: "hole-pages", section: "map", title: "Hole pages and the scorecard",
    body: "Hole page: one page per hole (letter, A4, a yardage-book card, or a square picture for social media); pick its size above the preview. Scorecard: the course's card, in its layout. Both take the General tab's colors and lettering.",
    words: "hole page yardage book card scorecard size",
    path: "Map › Hole page, Scorecard",
    where: { step: "map", tab: "page", find: "map-designer" }
  },

  // ------------------------------------------------------------------ Export
  {
    id: "print", section: "export", title: "Print: map, tee signs, scorecard",
    body: "The course map as a PDF, PNG or SVG (at its paper size), the tee signs as a PDF or a ZIP of pictures (under 5 MB each, for UDisc), and the scorecard. 3D picture saves the view as it is.",
    words: "print pdf png svg download tee signs zip scorecard udisc picture",
    path: "Export › Print",
    where: { step: "export", find: "export-map-pdf" }
  },
  {
    id: "hole-by-hole", section: "export", title: "Hole by hole",
    body: "All holes as one PDF or a ZIP of pictures, or one hole: its page as a PDF, PNG or SVG, and its GeoJSON.",
    words: "hole pages pdf zip one hole geojson",
    path: "Export › Hole by hole",
    where: { step: "export", find: "hole-exports" }
  },
  {
    id: "video", section: "export", title: "Flyover video",
    body: "Record the whole course, or one hole, at the size and frame rate picked. The camera and what shows on screen are set from a tee (Camera).",
    words: "video record flyover mp4 resolution fps frame rate",
    path: "Export › Flyover video",
    where: { step: "export", find: "video-record" }
  },
  {
    id: "gps-files", section: "export", title: "GPS and data files",
    body: "KML (Google Earth), GeoJSON and GPX with every tee, basket and hole at its real place (the site must be brought in). Spreadsheets: the holes, the stake-out list for marking the course on the ground, and the parts list with prices you can change.",
    words: "gps kml gpx geojson google earth csv spreadsheet stake out parts list prices budget",
    path: "Export › GPS and data",
    where: { step: "export", find: "export-kml" }
  },

  // ------------------------------------------------------------------ Sharing
  {
    id: "live-draft", section: "share", title: "Live or in a draft",
    body: "Live: changes go straight into the course. In a draft: your changes wait apart until you publish them (or send them for the owner's OK). The chip in the top bar shows which, and its menu switches.",
    words: "draft live publish chip",
    path: "Top bar › Live / Draft", server: true
  },
  {
    id: "save-draft", section: "share", title: "Save draft and history",
    body: "Name this save + Save draft (or Ctrl+S) keeps a named point in the history. History lists every version: Look at one, Compare it with now, Restore it, or take it into your draft.",
    words: "save draft history version restore compare",
    path: "Top bar › Draft › History", server: true
  },
  {
    id: "people", section: "share", title: "People",
    body: "Share › People: add someone by their username as a viewer, editor or co-owner, and choose what viewers see. Need my OK makes editors send their drafts for your OK before they go in.",
    words: "share people invite viewer editor owner role permissions approval",
    path: "Share › People",
    where: { open: "share-people" }, server: true
  },
  {
    id: "public-links", section: "share", title: "Public links",
    body: "A public link is a course page anyone with it can see: pick what it shows (the map, 3D, flyovers, signs, scorecard, numbers, downloads), give it its own name, a password and an end date. Turn it off or give it a new address any time.",
    words: "public link share url password expire course page",
    path: "Share › Public link and site",
    where: { open: "share-public" }, server: true
  },
  {
    id: "public-site", section: "share", title: "The public site and how visitors see it",
    body: "The course page shows the version you last published: Update site after changes. How the map and 3D look to visitors (painted or the satellite photo, contour lines, hill shading) is set here for every link.",
    words: "public site update publish visitors painted photo look viewers",
    path: "Share › Public link and site › Public site",
    where: { open: "share-public", find: "public-site-settings" }, server: true
  },
  {
    id: "comments", section: "share", title: "Comments",
    body: "Comment on any spot of the map: everyone the course is shared with sees it, can reply, and resolve it when done.",
    words: "comments notes discuss reply resolve",
    path: "Top bar › chip › Comments", server: true
  },
  {
    id: "parks", section: "share", title: "Parks and nearby courses",
    body: "Name the park a course is in: other courses there show on the map (with close calls between their holes), and the ground can be shared between them.",
    words: "park nearby courses other courses share ground",
    path: "Site › Park", server: true
  },

  // ------------------------------------------------------------------ Phone
  {
    id: "phone-layout", section: "phone", title: "The phone layout",
    body: "The steps are along the bottom; the panel is a sheet: drag it up for more, down for more map, or tap a step again to step through its sizes. Tools are in a strip above the sheet; a drawing has its own Undo, Cancel and Done.",
    words: "phone mobile sheet bottom bar touch",
  },
  {
    id: "gestures", section: "phone", title: "Touch gestures",
    body: "One finger pans (or drags a picked thing), pinch zooms, two fingers up or down tilt into 3D, two fingers sideways turn the map. Tap picks; hold opens a thing's menu.",
    words: "gestures pinch tap hold tilt turn swipe"
  }
];
