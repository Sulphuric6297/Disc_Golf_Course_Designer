# Disc Golf Course Designer: working rules

A static React + Vite + TypeScript app, hosted on GitHub Pages. No API keys and no backend.
It is built on the map engine of the Security Camera Planner: the same site import (satellite
photo, elevation, trees), terrain, and one map view that is 2D looking straight down and 3D when
tilted.

What the owner asked for is in `docs/WANTS.md`. Keep it up to date, and tick an item only once
it has been seen working in the browser. `docs/RESEARCH.md` holds the research on other course
design tools and the PDGA guidance the app follows.

## Privacy (never break this)

- **Never put the owner's personal details in the repository.** That means no address, street,
  town, ZIP code, coordinates of their property, name, email, or photos and screenshots of
  their place. This covers code, tests, fixtures, docs, file names, commit messages, pull
  requests and the deployed site. The repository is public.
- Examples, fixtures and walkthroughs use made-up places ("Springfield Park").
- A check runs on every commit (`scripts/privacy-check.mjs`, hooked up by `npm ci`). It refuses:
  - an author without a no-reply email;
  - any added email address;
  - any `zz-*` file.

  It cannot recognise an address or a town, so read your diff and commit message for those yourself.

## How to work

- **Look at the real app, not just the tests.** For any UI change or UI bug:
  1. Run `npm run look`; screenshots of the main screens land in `look/`.
  2. Make the fix.
  3. Look at the same screens again.
  4. Show the before/after screenshots.
- **Say only what you have seen.** Call a feature working only after using it in the browser.
  Call it live only after the deployed site serves the new build.
- Develop on a feature branch. Do not merge to `main` (which deploys) without the owner's OK.

## Testing

- Every change is tested in full once, by CI on its pull request (`npm run check`).
- While working: run `npm run typecheck`, `npm run build`, and the spec files for the areas you
  changed (`npx playwright test tests/e2e/<area>.spec.ts`).
- Every bug fix adds a test that fails without the fix. Every new feature adds a test.
- `tests/e2e/fixtures.ts` **stubs all network traffic**: imagery tiles, elevation, geocoding
  and OpenStreetMap all return fixed local data, and anything else is aborted. Each test starts
  with empty storage and fails on any uncaught page error.
- Tests read the app through these hooks; keep them:
  - `window.__dgCourse()`: the course document;
  - `window.__dgEditor()`: the editor state;
  - `window.__dgHistory()`: undo and redo;
  - `window.__dgView`: the map view, with `toClient`, `toPlan`, `screenBox`, `fitHole` and `viewInfo`.
- Playwright is pinned to the version whose Chromium is installed in Claude Code cloud
  sessions (1.56.1). First-time setup is `npm ci`. On any other machine, also run
  `npx playwright install chromium`.

| Spec | Area |
| --- | --- |
| `smoke.spec.ts` | Loads, welcome card, steps, 2D/3D, shortcuts dialog |
| `holes.spec.ts` | New holes (tee then basket), live length and par, doglegs, fairway width, extra tees and pins, layouts, hole order, delete + undo |
| `features.spec.ts` | Drawing OB areas and lines, hazards, water, mandos (side, direction), drop zones, trees, amenities, labels, moving and reshaping shapes |
| `import-site.spec.ts` | Address search, framing the area, photo + elevation + trees + OpenStreetMap paths and water, elevation change per hole |
| `stats.spec.ts` | Hole math: PDGA effective length and par, doglegs, foliage, trees and OB in play, safety checks, design checks (pure logic) |
| `views.spec.ts` | View from the tee, flyover (a slow frame doesn't skip it), back to the map |
| `design.spec.ts` | Map designer: themes, colors, title block, legend, hole table, contours, turning the map; the Forest painting (tree cover from sparse to dense, winding creeks and trails), basket marks (five kinds, legend, older courses); the printed map's and tee signs' contents |
| `export.spec.ts` | Course map (SVG/PNG/PDF), tee signs, scorecard, GeoJSON, KML, GPX, CSV, stake-out list, parts list |
| `share.spec.ts` | Share links: packing, opening (view only), photo and elevation downloaded again, "Make a copy" (saved before the link leaves the address bar), never overwriting your own course |
| `persistence.spec.ts` | Autosave restore, course files, New keeps the old course in Recent courses |

## Project conventions

- Plan units are feet. Plan (x, y) runs east and south from the site's north-west corner, and is
  3D world (x, z) with Y up.
- The course document is in `src/state/course.ts` (zustand, with undo and redo); its types are in
  `src/types.ts`. Editor-only state (selection, tool, view) is the `useEditor` store.
- Pure logic goes in `src/lib/`:
  - `holeStats.ts`: par, lengths and checks;
  - `geom.ts`;
  - `mapSvg.ts`: the printed map (vector symbols and labels, basket marks);
  - `forest.ts`: the Forest style's painted land (one picture: canopy height field lit from the
    top left, fairways, dirt, water, roads), cached by what it depends on;
  - `exports.ts`;
  - `share.ts`;
  - `geo/`: site import.
- The map view engine is `src/viewport/CourseView.ts`, wrapped by `src/components/MapViewport.tsx`.
