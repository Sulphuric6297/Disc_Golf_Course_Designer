"""The 3D view's skies (public/sky/): CC0 photographed skies from Poly Haven (their tone-mapped JPGs,
8192 x 4096), the upper half only (the land hides the rest), at 4096 x 1024 for computers and
2048 x 512 for phones, and where each one's sun is (so the view turns it to where the light comes
from) with its average color (for the light from the sky).

  python3 scripts/sky-photos.py <folder of tone-mapped JPGs> public/sky
"""
import json, sys
from PIL import Image, ImageStat

SRC, OUT = sys.argv[1], sys.argv[2]
SKIES = {"midday": "farm_field_puresky", "afternoon": "evening_road_01_puresky", "sunset": "belfast_sunset_puresky"}
Image.MAX_IMAGE_PIXELS = None
info = {}
for name, src in SKIES.items():
    img = Image.open(f"{SRC}/{src}.jpg").convert("RGB")
    w, h = img.size
    top = img.crop((0, 0, w, h // 2))
    top.resize((4096, 1024), Image.LANCZOS).save(f"{OUT}/{name}-4k.jpg", quality=86, optimize=True, progressive=True)
    top.resize((2048, 512), Image.LANCZOS).save(f"{OUT}/{name}-2k.jpg", quality=86, optimize=True, progressive=True)
    # (the sun: the brightest spot, on a small copy; u across from the left, v up from the horizon)
    small = top.resize((512, 128), Image.BILINEAR).convert("L")
    px = small.load()
    best, at = -1, (0, 0)
    for y in range(128):
        for x in range(512):
            if px[x, y] > best: best, at = px[x, y], (x, y)
    mean = ImageStat.Stat(top.resize((256, 64))).mean
    info[name] = {"sunU": round((at[0] + 0.5) / 512, 4), "sunV": round(1 - (at[1] + 0.5) / 128, 4), "average": "#%02x%02x%02x" % tuple(round(m) for m in mean), "source": src}
json.dump(info, open(f"{OUT}/skies.json", "w"), indent=1)
print(json.dumps(info, indent=1))
