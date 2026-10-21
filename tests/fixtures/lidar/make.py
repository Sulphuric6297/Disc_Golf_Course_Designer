# Makes the made-up LiDAR survey the tests read (an Entwine Point Tiles survey of one tile, like
# USGS 3DEP on AWS): ground sloping gently east round the test site (Springfield Park) and a few
# trees at known spots. Needs laspy and lazrs: python3 make.py
import json, math, os
import numpy as np
import laspy

HERE = os.path.dirname(os.path.abspath(__file__))
LAT, LON = 39.78073, -89.68103
R = 6378137.0
cx = R * math.radians(LON)
cy = R * math.log(math.tan(math.pi / 4 + math.radians(LAT) / 2))
# Web Mercator stretches distances by 1/cos(latitude): meters on the ground to Mercator meters
k = 1 / math.cos(math.radians(LAT))

def ground(e, n):
    return 180.0 + 0.02 * e

# Trees (meters east and north of the site's middle): height, crown radius, a conifer
TREES = [(30, 20, 18, 4.5, 0), (-40, -10, 25, 2.6, 1), (60, -70, 22, 5, 0)] + [(x, -40, 16, 3.5, 0) for x in (-60, -40, -20, 0, 20)]
pts = []
for e in np.arange(-260, 260, 1.4):
    for n in np.arange(-260, 260, 1.4):
        pts.append((e, n, ground(e, n), 2))
for (te, tn, h, r, conifer) in TREES:
    for e in np.arange(te - r, te + r + 0.01, 0.5):
        for n in np.arange(tn - r, tn + r + 0.01, 0.5):
            d = math.hypot(e - te, n - tn) / r
            if d > 1:
                continue
            drop = (d ** 2) * (h * (0.25 if conifer else 0.12))
            pts.append((e, n, ground(e, n) + h - drop, 5))
a = np.array(pts)
X = cx + a[:, 0] * k
Y = cy + a[:, 1] * k
Z = a[:, 2]
hdr = laspy.LasHeader(point_format=6, version="1.4")
hdr.scales = np.array([0.01, 0.01, 0.01])
hdr.offsets = np.array([round(cx), round(cy), 0])
las = laspy.LasData(hdr)
las.x, las.y, las.z = X, Y, Z
las.classification = a[:, 3].astype(np.uint8)
las.return_number = np.ones(len(a), dtype=np.uint8)
las.number_of_returns = np.ones(len(a), dtype=np.uint8)
os.makedirs(os.path.join(HERE, "ept-data"), exist_ok=True)
os.makedirs(os.path.join(HERE, "ept-hierarchy"), exist_ok=True)
las.write(os.path.join(HERE, "ept-data", "0-0-0-0.laz"), laz_backend=laspy.LazBackend.Lazrs)
half = 2048.0
ept = {"bounds": [cx - half, cy - half, -half, cx + half, cy + half, half], "boundsConforming": [float(X.min()), float(Y.min()), float(Z.min()), float(X.max()), float(Y.max()), float(Z.max())], "dataType": "laszip", "hierarchyType": "json", "points": len(a), "span": 128, "srs": {"authority": "EPSG", "horizontal": "3857"}, "version": "1.0.0", "schema": []}
json.dump(ept, open(os.path.join(HERE, "ept.json"), "w"))
json.dump({"0-0-0-0": len(a)}, open(os.path.join(HERE, "ept-hierarchy", "0-0-0-0.json"), "w"))
print(len(a), "points")
