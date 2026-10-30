"""The trees each US region grows, for HyzerLab's recommended kinds of trees: the USDA Forest
Service's Forest Inventory and Analysis (FIA) survey, live trees (1 inch and up) on forest land by
species in each state's latest survey, added up by region and grouped into the tree looks HyzerLab
can draw. With each county's center and state (Census Gazetteer), so the app finds a course's state,
and so its region, offline. Public data (US government). Writes tree-regions.json.
python3 scripts/tree-mix.py src/data (a few minutes: every state, one request each)"""
import io, json, re, sys, time, urllib.parse, urllib.request, zipfile

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
API = "https://apps.fs.usda.gov/fiadb-api"
SNUM = "Number of live trees (at least 1 inch d.b.h./d.r.c.), in trees, on forest land"
LOOKS = ["oak", "ash", "maple", "aspen", "birch", "willow", "pear", "pine", "spruce", "cedar"]
# Each genus to the look nearest it (what HyzerLab's tree engine can grow)
GENUS = {
    # broadleaf
    "Quercus": "oak", "Fagus": "oak", "Castanea": "oak", "Lithocarpus": "oak", "Notholithocarpus": "oak", "Ulmus": "oak",
    "Celtis": "oak", "Morus": "oak", "Diospyros": "oak", "Magnolia": "oak", "Arbutus": "oak", "Prosopis": "oak", "Chrysolepis": "oak",
    "Fraxinus": "ash", "Carya": "ash", "Juglans": "ash", "Gleditsia": "ash", "Robinia": "ash", "Ailanthus": "ash", "Prunus": "ash",
    "Sapindus": "ash", "Maclura": "ash", "Gymnocladus": "ash", "Melia": "ash", "Schinus": "ash", "Leucaena": "ash", "Acacia": "ash",
    "Acer": "maple", "Liquidambar": "maple", "Platanus": "maple", "Liriodendron": "maple", "Nyssa": "maple", "Sassafras": "maple",
    "Oxydendrum": "maple", "Tilia": "maple", "Aesculus": "maple", "Cornus": "maple", "Cercis": "maple", "Ilex": "maple",
    "Rhamnus": "maple", "Asimina": "maple", "Triadica": "maple", "Paulownia": "maple", "Halesia": "birch",
    "Persea": "oak", "Gordonia": "oak", "Planera": "oak", "Sideroxylon": "oak", "Umbellularia": "oak", "Cercocarpus": "oak", "Morella": "oak",
    "Populus": "aspen", "Eucalyptus": "aspen",
    "Betula": "birch", "Ostrya": "birch", "Carpinus": "birch", "Alnus": "birch",
    "Salix": "willow",
    "Pyrus": "pear", "Malus": "pear", "Crataegus": "pear", "Amelanchier": "pear", "Sorbus": "pear",
    # needles
    "Pinus": "pine",
    "Picea": "spruce", "Abies": "spruce", "Tsuga": "spruce", "Pseudotsuga": "spruce", "Larix": "spruce", "Sequoia": "spruce", "Sequoiadendron": "spruce", "Taxus": "spruce",
    "Juniperus": "cedar", "Thuja": "cedar", "Chamaecyparis": "cedar", "Calocedrus": "cedar", "Taxodium": "cedar", "Cupressus": "cedar", "Hesperocyparis": "cedar",
}
STATES = ["01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
          "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56"]

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "HyzerLab tree-mix builder"}), timeout=180) as r:
                return r.read()
        except Exception as e:  # (the API is slow now and then: try again)
            if k == tries - 1: raise
            time.sleep(5 * (k + 1))

# Each state's survey years; the newest first (one that gives no trees: the year before)
wc_html = get(f"{API}/fullreport/parameters/wc").decode()
years = {}
# (a survey's code: the state's number, one or two digits, then the year)
for ev in re.findall(r"<td>(\d{5,6})</td>", wc_html):
    years.setdefault(ev[:-4].zfill(2), set()).add(ev)

def look_of(spcd, name):
    m = re.search(r"\(([A-Z][a-z]+)", name)
    genus = m.group(1) if m else ""
    if genus in GENUS: return GENUS[genus]
    # (FIA species codes under 300 are softwoods: a needle tree; the rest broadleaf)
    return "spruce" if spcd < 300 else "oak"

counties, states, unknown = {}, {}, {}
for st in STATES:
    got = None
    for ev in sorted(years.get(st, []), key=lambda e: int(e[-4:]), reverse=True)[:10]:
        q = urllib.parse.urlencode({"snum": SNUM, "rselected": "County code and name", "cselected": "Species", "wc": ev, "outputFormat": "NJSON", "estOnly": "Y"})
        try:
            d = json.loads(get(f"{API}/fullreport?{q}"))
        except Exception as e:
            print(st, ev, "failed", e, flush=True); continue
        rows = d.get("estimates") or []
        if rows: got = (ev, rows); break
    if not got:
        print(st, "no survey with trees", flush=True); continue
    ev, rows = got
    for r in rows:
        g1, g2, est = r.get("GRP1", ""), r.get("GRP2", ""), r.get("ESTIMATE") or 0
        m1 = re.match(r"`?(\d{5})", g1)
        m2 = re.search(r"SPCD (\d+) - (.*)", g2)
        if not m1 or not m2 or est <= 0: continue
        fips, spcd = m1.group(1), int(m2.group(1))
        look = look_of(spcd, m2.group(2))
        m = re.search(r"\(([A-Z][a-z]+)", m2.group(2))
        if m and m.group(1) not in GENUS: unknown[m.group(1)] = unknown.get(m.group(1), 0) + est
        counties.setdefault(fips, {}).setdefault(look, 0)
        counties[fips][look] += est
        states.setdefault(st, {}).setdefault(look, 0)
        states[st][look] += est
    print(st, ev, len(rows), "rows", flush=True)

# The regions, by state (FIPS)
REGIONS = [
    ("northeast", "the Northeast", ["09", "23", "25", "33", "44", "50", "36", "34", "42"]),
    ("appalachia", "the Mid-Atlantic and Appalachians", ["10", "24", "11", "51", "54", "21", "47"]),
    ("southeast", "the Southeast", ["37", "45", "13", "12", "01", "28"]),
    ("southcentral", "the South Central states", ["22", "05", "48", "40"]),
    ("midwest", "the Midwest", ["39", "18", "17", "26", "55", "27", "19", "29"]),
    ("plains", "the Great Plains", ["38", "46", "31", "20"]),
    ("rockies", "the Rocky Mountains", ["30", "16", "56", "08", "49", "32"]),
    ("southwest", "the Southwest", ["04", "35"]),
    ("northwest", "the Pacific Northwest", ["53", "41"]),
    ("california", "California", ["06"]),
    ("alaska", "Alaska", ["02"]),
    ("hawaii", "Hawaii", ["15"]),
]

def pct(mix):
    total = sum(mix.values()) or 1
    out = [round(100 * mix.get(l, 0) / total) for l in LOOKS]
    return out

# The counties' centers and their states (Census Gazetteer): where a course is
z = zipfile.ZipFile(io.BytesIO(get("https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip")))
text = z.read(z.namelist()[0]).decode("latin-1").splitlines()
head = [h.strip() for h in text[0].split("\t")]
gi, la, lo = head.index("GEOID"), head.index("INTPTLAT"), head.index("INTPTLONG")
centers = []
for line in text[1:]:
    c = [x.strip() for x in line.split("\t")]
    centers.append([round(float(c[la]), 2), round(float(c[lo]), 2), int(c[gi][:2])])

# Each region: its trees added up over its states (by count), each look's share
regions = []
for rid, name, sts in REGIONS:
    mix = {}
    for st in sts:
        for l, v in states.get(st, {}).items(): mix[l] = mix.get(l, 0) + v
    if not mix: continue
    shares = dict(zip(LOOKS, pct(mix)))
    regions.append({"id": rid, "name": name, "states": [int(x) for x in sts], "shares": {l: v for l, v in shares.items() if v}})

json.dump({
    "source": "USDA Forest Service, Forest Inventory and Analysis (FIADB-API); US Census Bureau Gazetteer 2023",
    "measure": SNUM,
    "looks": LOOKS,
    "regions": regions,
    "centers": centers,
}, open(f"{OUT}/tree-regions.json", "w"), separators=(",", ":"))
for r in regions: print(r["id"], sorted(r["shares"].items(), key=lambda x: -x[1]))
print("genera mapped by default", sorted(unknown.items(), key=lambda x: -x[1])[:15])
