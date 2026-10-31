"""The 3D ground's close-up textures (public/ground/): CC0 scans from Poly Haven and ambientCG, each cut
to 512 px and stacked in one strip per kind of map, in the order of three/surfaceDetail's LAYERS.

  color.jpg   each scan's color as a variation round its own average (128 is the average): the
              ground keeps its own colors (the site's photo, the painted map, a path's) and takes
              only the scan's grain, light and dark, and its slight changes of hue
  normal.jpg  each scan's bumps (an OpenGL normal map), so the sun lights them

Run with the scans downloaded into one folder (python3 scripts/ground-scans.py <scans> public/ground);
the sources are listed in public/ground/SOURCES.md. Needs Pillow.
"""
import sys
from PIL import Image, ImageStat

SRC, OUT = sys.argv[1], sys.argv[2]
SIZE = 512
# (layer, color file, normal file): the order is the shader's
LAYERS = [
    ("grass", "grass004/x/Grass004_1K-JPG_Color.jpg", "grass004/x/Grass004_1K-JPG_NormalGL.jpg"),
    ("concrete", "ground/concrete_pavement_Diffuse.jpg", "ground/concrete_pavement_nor_gl.jpg"),
    ("asphalt", "ground/asphalt_01_Diffuse.jpg", "ground/asphalt_01_nor_gl.jpg"),
    ("dirt", "ground/park_dirt_Diffuse.jpg", "ground/park_dirt_nor_gl.jpg"),
    ("gravel", "ground/gravel_ground_01_Diffuse.jpg", "ground/gravel_ground_01_nor_gl.jpg"),
    ("chips", "ground/wood_chips_Diffuse.jpg", "ground/wood_chips_nor_gl.jpg"),
    ("leaves", "ground/forest_leaves_02_Diffuse.jpg", "ground/forest_leaves_02_nor_gl.jpg"),
    ("needles", "ground/forrest_ground_03_Diffuse.jpg", "ground/forrest_ground_03_nor_gl.jpg"),
    ("sand", "ground/park_sand_Diffuse.jpg", "ground/park_sand_nor_gl.jpg"),
]

color = Image.new("RGB", (SIZE, SIZE * len(LAYERS)))
normal = Image.new("RGB", (SIZE, SIZE * len(LAYERS)))
means = []
for i, (name, c, n) in enumerate(LAYERS):
    img = Image.open(f"{SRC}/{c}").convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    mean = ImageStat.Stat(img).mean
    means.append([round(m) for m in mean])
    # (each channel over its own average, 128 the average: 0.5x to 2x of it fits)
    bands = [b.point(lambda v, m=mean[k]: max(0, min(255, round(v * 128 / max(m, 1))))) for k, b in enumerate(img.split())]
    color.paste(Image.merge("RGB", bands), (0, i * SIZE))
    normal.paste(Image.open(f"{SRC}/{n}").convert("RGB").resize((SIZE, SIZE), Image.LANCZOS), (0, i * SIZE))
color.save(f"{OUT}/color.jpg", quality=88, optimize=True)
normal.save(f"{OUT}/normal.jpg", quality=90, optimize=True)
print("layers", [l[0] for l in LAYERS])
print("means", means)
