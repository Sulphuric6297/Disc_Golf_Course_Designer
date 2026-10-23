# HyzerLab

HyzerLab is a disc golf course designer that runs in your browser. You pick a piece of ground, it brings in what it can about that ground, and you lay out the holes on top of it. When you're done, it makes the course map, tee signs, hole pages and scorecard for you to print.

There's a demo with no accounts or server. Your courses stay in your browser. Running your own server adds accounts, sharing and a public page for each course.

## Why this exists

I'm not a coder. I work in IT, and I'm enough of a nerd to want software that didn't exist yet. HyzerLab was built entirely with AI. I brought the problem, plus a fairly unreasonable amount of time spent telling a computer that something still wasn't right.

It's the old story: I had a problem, couldn't find software that fit it, so I built my own. Apparently that's everyone's origin story now. This one's mine.

The part I care about most is the start and the finish. At the start, the app pulls in as much as possible for you: elevation, streets, trees, buildings, paths and water. You pick the area and it fills in what it can. At the finish, it makes maps I think are genuinely good-looking, and you can get from a layout to printable course maps and tee signs without spending hours in Illustrator.

Because AI gave me access to the collective work of millions of developers, I want this to be as free as possible. It's free and open source. With software getting easier to recreate, I don't see much point in locking it down and charging for it.

There's probably still some slop in here. I've tried to keep it to a minimum. If you find some, open an issue.

## What it does

- **Brings in the site.** Search for a park, frame the area, and it pulls in the satellite photo, the elevation, paths, roads, water and buildings from OpenStreetMap, and in the US the real trees and ground from USGS aerial surveys (LiDAR).
- **Lays out holes.** Click a tee spot, then a basket spot. Bend the line, set the fairway, add more tees and pin positions, OB, mandos, paths, bridges and trees. Lengths, elevation change and par update as you go.
- **Checks the design.** It flags holes that cross or run too close, throws over roads or parking, and holes with no path to the next tee.
- **Shows it in 3D.** Look at the course from above, stand on any tee, or fly down a hole. Flyovers can be recorded as video.
- **Makes the printouts.** Course maps in a few painted styles, tee signs, hole pages and a scorecard, plus GPS files for staking the course out.
- **Works on a phone.** Walk the course with your location on the map, see the distance to the basket, and drop a tee or basket where you're standing.

Press **?** in the app for the help guide, or **Ctrl+K** to search for any setting.

## What to expect from the import

It's a starting point, not a survey of your park. Expect to clean some things up.

- Real trees from LiDAR are US only, and only where a survey has been flown. Outside the US there are no measured trees and the elevation is rough (about 10 m).
- Trees spotted on the satellite photo are estimates and miss a lot in thick woods.
- Paths and buildings are only as good as what people have mapped in OpenStreetMap.

## Run it

```
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, build and tests
```

The default build is the demo. `VITE_SERVER=1` builds it for a HyzerLab server.

## Your own server

The server (in `server/`, Fastify and Postgres) adds invite-only accounts with two-factor sign-in, sharing by username, drafts and version history, comments on the map, and a public page for each course. To run it with Docker:

```
cp .env.example .env          # fill it in; the comments explain each value
docker compose up -d
docker compose logs app       # shows the setup code for the first (admin) account
```

Put it behind HTTPS, since the sign-in cookies need it.

## Credits

Imagery from Esri and NC OneMap. Map data from OpenStreetMap contributors. Elevation and LiDAR from the USGS. Par guidance from the PDGA.

## License

Free and open source under the [GNU Affero General Public License v3.0 or later](LICENSE). Anyone can use it, change it and host it. If you run a changed copy for other people, you have to share your changed code with them.
