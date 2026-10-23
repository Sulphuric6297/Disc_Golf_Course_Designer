# HyzerLab

HyzerLab is a disc golf course designer. It runs in your browser, and it was built 100% using AI. I'm not a coder. I'm an IT provider nerd. I wanted this to exist, and AI let me make it happen. I'm pretty happy about that.

It's the old trope. I had a problem, couldn't find software that fit the need, so I built it myself. Apparently everyone has this origin story now. This one is also mine.

## What it does

The very cool thing is that it imports as much as possible for you from the get go. You pick the area and it pulls in what it can: the satellite photo, elevation, streets, paths, water, buildings, and in the US the real trees from aerial LiDAR surveys.

From there you lay out the holes. Click a tee spot, then a basket spot. Bend it, set the fairway, add more tees and pins, OB, mandos, paths, bridges and trees. The length, elevation change and par update as you go, and it'll tell you when holes run too close together, throw over a road, or don't have a path to the next tee.

You can look at the whole thing in 3D, stand on any tee, or fly down a hole and record it as a video.

The part I really love, though, is the maps. I think it makes some really beautiful ones. You can take a layout and turn it into printable course maps, tee signs, hole pages and a scorecard without spending hours in Illustrator. It'll also give you GPS files for staking it out.

It works on a phone too. Turn on your location and walk the course, see how far you are from the basket, and drop a tee or basket right where you're standing.

If you get lost, press **?** in the app for the help guide, or **Ctrl+K** to search for any setting.

## Fair warning

It's not perfect. Most of the time the import will need some cleanup. It has not personally visited your park.

- The real trees only come in for the US, and only where a survey has been flown. Outside the US there are no measured trees and the elevation is pretty rough.
- Trees it spots on the satellite photo are guesses, and it misses a lot of them in thick woods.
- Paths and buildings are only as good as what people have put on OpenStreetMap.

But it does a really good job of giving you a decent starting point instead of making you plot everything yourself.

## Why it's free

The way I see it, this exists because AI gave me access to the collective genius of millions of coders. I brought the problem and a fairly unreasonable amount of time spent telling a computer that something still wasn't right.

So I want this to be as free as possible. It's free and open source. With software getting easier to reverse engineer and recreate, I don't see much point in trying to lock it down and charge for it.

And yes, there's probably some slop in here too. I've tried my best to keep it to a minimum. If you find some, open an issue.

## Trying it out

You'll need Node.js (version 22 is what it's built with). Then:

```
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, build and tests
```

That's the demo version: no accounts, and your courses stay in your browser.

## Hosting it yourself

If you want accounts, sharing, drafts and history, comments on the map and a public page for each course, you'll want to run your own server. It's all in Docker, so it's not too bad.

**What you need**

- A computer that stays on. A Linux box, a VM or a cheap VPS all work.
- Docker with Docker Compose.
- A web address (a domain or subdomain) and a way to put HTTPS in front of the app, like Cloudflare Tunnel, Caddy or nginx. HTTPS isn't optional here, because the sign-in cookies won't work without it.
- An authenticator app on your phone, if you want two-factor sign-in. It's optional: each person can turn it on in their account, and an admin can require it for anyone.

**Setting it up**

1. Clone this repo onto the server and open the folder.
2. Copy the settings file:
   ```
   cp .env.example .env
   ```
3. Fill in `.env`. The comments in it explain each one, but the short version:
   - `DB_PASSWORD`: anything long and random. `openssl rand -base64 24` makes one.
   - `APP_SECRET`: `openssl rand -base64 32`.
   - `APP_ORIGINS`: your address exactly as it shows in the browser, like `https://hyzerlab.example.com`.
   - Leave `TRUST_PROXY` and `COOKIE_SECURE` alone unless you know you need to change them.
4. Start it:
   ```
   docker compose up -d --build
   ```
   The app listens on `127.0.0.1:8080` (change `PORT` in `.env` if that's taken). It only listens on the machine itself, so it isn't open to the world until you point your tunnel or reverse proxy at it.
5. Point your tunnel or reverse proxy at `http://127.0.0.1:8080`.
6. Get the setup code:
   ```
   docker compose logs app
   ```
7. Open your address, enter the setup code, and make the first account. That one is the admin. I'd turn on two-factor sign-in for it from **Account** right away.
8. Invite everyone else from inside the app. There's no public sign-up, so nobody gets in without an invite link from the admin.

**Backups and updates**

The database is backed up every night into the `backups` folder, and the last 14 are kept. It's worth copying that folder somewhere else every so often.

To update to a newer version:

```
git pull
docker compose up -d --build
```

## Credits

Imagery from Esri and NC OneMap. Map data from OpenStreetMap contributors. Elevation and LiDAR from the USGS. Par guidance from the PDGA.

## License

Free and open source under the [GNU Affero General Public License v3.0 or later](LICENSE). Anyone can use it, change it and host it. If you run a changed copy for other people, you have to share your changed code with them.
