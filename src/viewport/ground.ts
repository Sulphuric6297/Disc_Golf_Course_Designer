// The site's ground: terrain, the aerial photo draped on it, grid, contours, elevation shading and
// the cut-away sides that make a sloped site read as a block of land.
import * as THREE from "three";
import { MAP_OVERLAY_OFFSET } from "../constants";
import { heightAt } from "../lib/terrainGrid";
import { elevationColor } from "../lib/terrain";
import { disposeObjectDeep } from "../three/dispose";
import { GROUND_MATERIALS, PAINT_CELL_FT } from "../lib/groundPaint";
import { addGroundDetail, coverTexture, groundDetailTexture, groundDetailUniforms } from "../three/groundDetail";
import type { GroundDoc as ViewDoc } from "./types";

const noRaycast = (o: THREE.Object3D) => { o.raycast = () => {}; return o; };

export class Ground {
  readonly group = new THREE.Group();
  terrain: THREE.Mesh | null = null;
  photo: THREE.Texture | null = null;
  private photoUrl: string | null = null;
  private mapPlane: THREE.Mesh | null = null;
  private shade: THREE.Mesh | null = null;
  /** Map-only drawings on the ground (grid, site edge, contours, cut-away sides): hidden in camera views. */
  extras = new THREE.Group();
  private key = "";
  private heightsRef: Record<string, number> | null = null;
  private overlayKey = "";
  /** Real-scale grass, concrete, asphalt and soil texture over the photo, and painted ground (see three/groundDetail). */
  readonly detail = groundDetailUniforms();
  private photoFt = 0;
  private wantDetail = true;
  private close = true;
  /** Painted ground as drawn so far, and the textures it is drawn into (one texel per painted square). */
  private paint: Record<string, number> = {};
  private paintGrid: { cols: number; rows: number; per: number; cell: number; color: Uint8Array; cover: Uint8Array } | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private onChanged: () => void) {
    this.group.name = "ground";
    this.group.add(this.extras);
  }

  private h(doc: ViewDoc, x: number, y: number) {
    return heightAt(doc.heights, doc.gridSize, x, y);
  }

  /** Rebuilds what changed. Returns true when anything did. */
  update(doc: ViewDoc) {
    const bg = doc.background;
    let changed = false;
    const key = JSON.stringify([doc.canvas, doc.gridSize, bg.rect, !!bg.url, doc.showGrid]);
    const planeMat = this.mapPlane?.material as THREE.MeshLambertMaterial | undefined;
    if (planeMat && (planeMat.opacity !== bg.opacity || planeMat.visible !== (!!this.photo && bg.opacity > 0.001))) {
      planeMat.opacity = bg.opacity;
      planeMat.visible = !!this.photo && bg.opacity > 0.001;
      changed = true;
    }
    this.photoFt = bg.rect.width / (doc.unitsPerFoot || 1);
    this.detail.groundFeet.value = 1 / (doc.unitsPerFoot || 1);
    if (this.wantDetail !== doc.groundDetail) {
      this.wantDetail = doc.groundDetail;
      this.detailActive(this.close);
      changed = true;
    }
    if (this.updatePaint(doc)) changed = true;
    if (key !== this.key || !this.terrain) {
      this.key = key;
      this.rebuild(doc);
      this.heightsRef = doc.heights;
      changed = true;
    } else if (this.heightsRef !== doc.heights) {
      this.heightsRef = doc.heights;
      this.reshape(doc);
      changed = true;
    }
    if (bg.url !== this.photoUrl) {
      this.photoUrl = bg.url;
      this.loadPhoto(bg.url);
      changed = true;
    }
    const overlayKey = JSON.stringify([doc.overlay, doc.contours.interval, doc.contours.segments.length, doc.terrain, doc.shadeUrl?.length ?? 0, !!bg.url, doc.groundColor]);
    if (changed || overlayKey !== this.overlayKey) {
      this.overlayKey = overlayKey;
      this.updateOverlays(doc);
      changed = true;
    }
    return changed;
  }

  private loadPhoto(url: string | null) {
    const mat = this.mapPlane?.material as THREE.MeshBasicMaterial | undefined;
    if (this.photo) this.photo.dispose();
    this.photo = null;
    this.setCover(null);
    if (!url) {
      if (mat) { mat.map = null; mat.visible = false; mat.needsUpdate = true; }
      return;
    }
    const tex = new THREE.TextureLoader().load(url, () => {
      this.onChanged();
      // What the ground is made of (lawn, paving, soil), worked out in the background
      const image = tex.image as HTMLImageElement;
      setTimeout(() => {
        if (this.photo !== tex) return;
        void coverTexture(image, this.photoFt).then(cover => {
          if (this.photo !== tex) { cover?.dispose(); return; }
          this.setCover(cover);
          this.onChanged();
        });
      }, 0);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.photo = tex;
    if (mat) { mat.map = tex; mat.visible = mat.opacity > 0.001; mat.needsUpdate = true; }
  }

  private setCover(cover: THREE.DataTexture | null) {
    this.detail.coverMap.value?.dispose();
    this.detail.coverMap.value = cover;
    if (cover) this.loadDetail();
  }

  /**
   * Whether the view is close enough for the ground texture to show (far away it averages out to
   * nothing, so it is skipped: less work for each frame, which matters on a slow device).
   */
  detailActive(close: boolean) {
    this.close = close;
    this.detail.groundDetail.value = close && this.wantDetail && this.detail.detailMap.value ? 1 : 0;
  }

  /** The texture patterns, once there is a photo's cover or painted ground to use them. */
  private loadDetail() {
    if (this.detail.detailMap.value) return;
    void groundDetailTexture().then(tex => {
      if (!tex || this.detail.detailMap.value) return;
      this.detail.detailMap.value = tex;
      this.detailActive(this.close);
      this.onChanged();
    });
  }

  /**
   * Painted ground into its two textures (color, and which pattern), over the whole plan. Only the
   * squares that changed since last time are rewritten, so brushing stays quick.
   */
  private updatePaint(doc: ViewDoc) {
    const paint = doc.groundPaint ?? {};
    const upf = doc.unitsPerFoot || 1;
    const cell = PAINT_CELL_FT * upf;
    // At most 2048 texels across (a huge plan groups several squares in one)
    const per = Math.max(1, Math.ceil(Math.max(doc.canvas.width, doc.canvas.height) / cell / 2048));
    const cols = Math.max(1, Math.ceil(doc.canvas.width / (cell * per))), rows = Math.max(1, Math.ceil(doc.canvas.height / (cell * per)));
    let g = this.paintGrid;
    const fresh = !g || g.cols !== cols || g.rows !== rows || g.per !== per || g.cell !== cell;
    if (!fresh && paint === this.paint) return false;
    const empty = !Object.keys(paint).length;
    if (empty) {
      this.paint = paint;
      if (!g) return false;
      this.detail.paintColorMap.value?.dispose();
      this.detail.paintCoverMap.value?.dispose();
      this.detail.paintColorMap.value = this.detail.paintCoverMap.value = null;
      this.detail.paintOn.value = 0;
      this.paintGrid = null;
      return true;
    }
    const colors = GROUND_MATERIALS.map(m => new THREE.Color(m.color));
    const write = (key: string, m: number) => {
      const [i, j] = key.split(",").map(Number);
      const ti = Math.floor(i / g!.per), tj = Math.floor(j / g!.per);
      if (ti < 0 || tj < 0 || ti >= g!.cols || tj >= g!.rows) return;
      const k = (tj * g!.cols + ti) * 4;
      const mat = m ? GROUND_MATERIALS[m - 1] : null;
      const c = m ? colors[m - 1] : null;
      g!.color[k] = c ? Math.round(c.r * 255) : 0;
      g!.color[k + 1] = c ? Math.round(c.g * 255) : 0;
      g!.color[k + 2] = c ? Math.round(c.b * 255) : 0;
      g!.color[k + 3] = m ? 255 : 0;
      for (let ch = 0; ch < 4; ch++) g!.cover[k + ch] = mat && mat.detail === ch ? 255 : 0;
    };
    if (fresh) {
      this.detail.paintColorMap.value?.dispose();
      this.detail.paintCoverMap.value?.dispose();
      g = this.paintGrid = { cols, rows, per, cell, color: new Uint8Array(cols * rows * 4), cover: new Uint8Array(cols * rows * 4) };
      const make = (data: Uint8Array, srgb: boolean) => {
        const t = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return t;
      };
      this.detail.paintColorMap.value = make(g.color, true);
      this.detail.paintCoverMap.value = make(g.cover, false);
      for (const key in paint) write(key, paint[key]);
    } else {
      for (const key in paint) if (this.paint[key] !== paint[key]) write(key, paint[key]);
      for (const key in this.paint) if (!(key in paint)) write(key, 0);
    }
    this.paint = paint;
    this.detail.paintColorMap.value!.needsUpdate = true;
    this.detail.paintCoverMap.value!.needsUpdate = true;
    this.detail.paintRect.value.set(0, 0, cols * cell * per, rows * cell * per);
    this.detail.paintOn.value = 1;
    this.loadDetail();
    return true;
  }

  private draped(doc: ViewDoc, x: number, y: number, w: number, d: number, lift: number) {
    const grid = doc.gridSize || 20;
    const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / grid)), Math.max(1, Math.round(d / grid)));
    geo.rotateX(-Math.PI / 2);
    geo.translate(x + w / 2, 0, y + d / 2);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.h(doc, pos.getX(i), pos.getZ(i)) + lift);
    geo.computeVertexNormals();
    return geo;
  }

  private redrape(doc: ViewDoc, mesh: THREE.Mesh | null, lift: number) {
    if (!mesh) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.h(doc, pos.getX(i), pos.getZ(i)) + lift);
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
  }

  private colorTerrain(doc: ViewDoc) {
    if (!this.terrain) return;
    const geo = this.terrain.geometry;
    const pos = geo.getAttribute("position");
    let attr = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!attr || attr.count !== pos.count) {
      attr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
      geo.setAttribute("color", attr);
    }
    // The theme's ground color, a little lighter up high and darker down low so slopes read
    // (or the elevation colors, when the elevation overlay is on)
    const flat = new THREE.Color(doc.groundColor);
    const c = new THREE.Color();
    const { min, relief } = doc.terrain;
    const tint = false;
    for (let i = 0; i < pos.count; i++) {
      const t = relief > 0.01 ? (pos.getY(i) - min) / relief : 0.5;
      if (tint && relief > 0.01) {
        const [r, g, b] = elevationColor(t);
        c.setRGB((r / 255) * 0.85, (g / 255) * 0.85, (b / 255) * 0.85, THREE.SRGBColorSpace);
      } else {
        c.copy(flat).offsetHSL(0, 0, (t - 0.5) * 0.12);
      }
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  }

  private rebuild(doc: ViewDoc) {
    disposeObjectDeep(this.group);
    this.group.clear();
    this.extras = new THREE.Group();
    this.group.add(this.extras);
    const { width, height } = doc.canvas;
    const terrain = new THREE.Mesh(
      this.draped(doc, 0, 0, width, height, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97, metalness: 0 })
    );
    addGroundDetail(terrain.material as THREE.Material, this.detail);
    terrain.name = "terrain-mesh";
    terrain.receiveShadow = true;
    this.terrain = terrain;
    this.colorTerrain(doc);
    this.group.add(terrain);

    const r = doc.background.rect;
    const mapPlane = new THREE.Mesh(
      this.draped(doc, r.x, r.y, r.width, r.height, MAP_OVERLAY_OFFSET),
      new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: this.photo,
        visible: !!this.photo && doc.background.opacity > 0.001,
        // Drawn in the transparent pass so it lands on top of the (opaque) terrain under it.
        transparent: true,
        opacity: doc.background.opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
      })
    );
    addGroundDetail(mapPlane.material as THREE.Material, this.detail);
    mapPlane.name = "terrain-map-plane";
    mapPlane.renderOrder = -1;
    mapPlane.receiveShadow = true;
    noRaycast(mapPlane);
    this.mapPlane = mapPlane;
    this.group.add(mapPlane);
  }

  private reshape(doc: ViewDoc) {
    this.redrape(doc, this.terrain, 0);
    this.colorTerrain(doc);
    this.redrape(doc, this.mapPlane, MAP_OVERLAY_OFFSET);
    this.redrape(doc, this.shade, MAP_OVERLAY_OFFSET * 2);
  }

  private updateOverlays(doc: ViewDoc) {
    disposeObjectDeep(this.extras);
    this.extras.clear();
    this.colorTerrain(doc);
    const { width: w, height: d } = doc.canvas;
    const hasTerrain = doc.terrain.relief > 0.01;
    const grid = doc.gridSize || 20;

    // Grid: only on a blank plan (over a photo it is clutter).
    if (doc.showGrid && !doc.background.url) {
      const verts: number[] = [];
      const lift = 0.05;
      for (let x = 0; x <= w + 1e-6; x += grid) {
        for (let y = 0; y < d; y += grid) {
          const y2 = Math.min(d, y + grid);
          verts.push(x, this.h(doc, x, y) + lift, y, x, this.h(doc, x, y2) + lift, y2);
        }
      }
      for (let y = 0; y <= d + 1e-6; y += grid) {
        for (let x = 0; x < w; x += grid) {
          const x2 = Math.min(w, x + grid);
          verts.push(x, this.h(doc, x, y) + lift, y, x2, this.h(doc, x2, y) + lift, y);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      this.extras.add(noRaycast(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.28, depthWrite: false }))));
    }

    // Site edge
    const edge: number[] = [];
    const corners = [[0, 0], [w, 0], [w, d], [0, d]];
    corners.forEach(([x1, y1], i) => {
      const [x2, y2] = corners[(i + 1) % 4];
      const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / grid));
      for (let s = 0; s < steps; s++) {
        const ax = x1 + ((x2 - x1) * s) / steps, ay = y1 + ((y2 - y1) * s) / steps;
        const bx = x1 + ((x2 - x1) * (s + 1)) / steps, by = y1 + ((y2 - y1) * (s + 1)) / steps;
        edge.push(ax, this.h(doc, ax, ay) + 0.1, ay, bx, this.h(doc, bx, by) + 0.1, by);
      }
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edge, 3));
    this.extras.add(noRaycast(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x94a3b8 }))));

    // Cut-away sides on sloped sites
    if (hasTerrain) {
      const base = Math.min(0, doc.terrain.min) - Math.max(2, doc.terrain.relief * 0.08);
      const pos: number[] = [];
      corners.forEach(([x1, y1], i) => {
        const [x2, y2] = corners[(i + 1) % 4];
        const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / grid));
        for (let s = 0; s < steps; s++) {
          const ax = x1 + ((x2 - x1) * s) / steps, ay = y1 + ((y2 - y1) * s) / steps;
          const bx = x1 + ((x2 - x1) * (s + 1)) / steps, by = y1 + ((y2 - y1) * (s + 1)) / steps;
          const ha = this.h(doc, ax, ay), hb = this.h(doc, bx, by);
          pos.push(ax, ha, ay, ax, base, ay, bx, hb, by, bx, hb, by, ax, base, ay, bx, base, by);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      this.extras.add(noRaycast(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1, side: THREE.DoubleSide }))));
    }

    // Contour lines draped on the ground (every 5th brighter)
    if (doc.overlay !== "off" && doc.contours.segments.length) {
      const minor: number[] = [];
      const major: number[] = [];
      const interval = doc.contours.interval || 1;
      doc.contours.segments.forEach(s => {
        const isMajor = Math.abs(Math.round(s.level / interval)) % 5 === 0;
        (isMajor ? major : minor).push(s.x1, s.level + 0.25, s.y1, s.x2, s.level + 0.25, s.y2);
      });
      const color = doc.background.url ? 0xfff7e6 : 0x44341e;
      ([[minor, 0.45], [major, 0.9]] as [number[], number][]).forEach(([v, opacity]) => {
        if (!v.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
        this.extras.add(noRaycast(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))));
      });
    }

    // Hillshade draped over the photo
    if (this.shade) {
      this.shade = null;
    }
    if (doc.overlay === "shaded" && doc.shadeUrl && hasTerrain) {
      const tex = new THREE.TextureLoader().load(doc.shadeUrl, () => this.onChanged());
      tex.colorSpace = THREE.SRGBColorSpace;
      const shade = new THREE.Mesh(
        this.draped(doc, 0, 0, w, d, MAP_OVERLAY_OFFSET * 2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: doc.background.url ? 0.5 : 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })
      );
      shade.renderOrder = -1;
      noRaycast(shade);
      this.shade = shade;
      this.extras.add(shade);
    }
  }

  dispose() {
    disposeObjectDeep(this.group);
    this.photo?.dispose();
    this.setCover(null);
    this.detail.paintColorMap.value?.dispose();
    this.detail.paintCoverMap.value?.dispose();
  }
}
