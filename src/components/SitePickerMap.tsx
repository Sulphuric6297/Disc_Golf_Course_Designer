import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import L from "leaflet";
import { GeoBounds, SITE_MIN_WIDTH_FT, selectionFromBounds } from "../lib/geo/core";
import { MAP_IMAGERY_SOURCES, MapImagerySource, PICKER_LAYERS, STATE_ORTHO_SOURCES } from "../lib/geo/imagery";


// Interactive satellite map used to pick the site (from the Security Camera Planner).
// Drag pans the map; draw a rectangle with the Draw tool or Shift+drag; then move/resize it with its handles.
export function SitePickerMap({
  imagery,
  view,
  selection,
  drawing,
  onDrawingChange,
  onSelect,
  selectViewSignal
}: {
  imagery: MapImagerySource;
  view: { lat: number; lon: number; zoom: number; key: number };
  selection: GeoBounds | null;
  drawing: boolean;
  onDrawingChange: (drawing: boolean) => void;
  onSelect: (bounds: GeoBounds) => void;
  selectViewSignal: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const rectRef = useRef<L.Rectangle | null>(null);
  const handlesRef = useRef<L.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const onDrawingChangeRef = useRef(onDrawingChange);
  const drawingRef = useRef(drawing);
  onSelectRef.current = onSelect;
  onDrawingChangeRef.current = onDrawingChange;
  drawingRef.current = drawing;

  const boundsToObj = (b: L.LatLngBounds): GeoBounds => ({ north: b.getNorth(), south: b.getSouth(), west: b.getWest(), east: b.getEast() });
  const dimsLabel = (b: GeoBounds) => {
    const d = selectionFromBounds(b, "");
    return `${Math.round(d.widthFt)} × ${Math.round(d.heightFt)} ft`;
  };
  const isUsable = (b: GeoBounds) => {
    const d = selectionFromBounds(b, "");
    return d.widthFt >= SITE_MIN_WIDTH_FT && d.heightFt >= SITE_MIN_WIDTH_FT;
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, maxZoom: 21, attributionControl: true, boxZoom: false })
      .setView([view.lat, view.lon], view.zoom);
    mapRef.current = map;
    const resize = window.setTimeout(() => map.invalidateSize(), 60);

    // Rectangle drawing: Draw tool, or Shift+drag at any time. Pointer events so touch works too.
    const container = map.getContainer();
    let start: L.LatLng | null = null;
    let preview: L.Rectangle | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !(drawingRef.current || e.shiftKey)) return;
      if ((e.target as HTMLElement).closest(".leaflet-control, .site-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      container.setPointerCapture?.(e.pointerId);
      start = map.mouseEventToLatLng(e as unknown as MouseEvent);
      preview = L.rectangle(L.latLngBounds(start, start), { color: "#f59e0b", weight: 2, fillOpacity: 0.12, interactive: false }).addTo(map);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!start || !preview) return;
      e.preventDefault();
      e.stopPropagation();
      const b = L.latLngBounds(start, map.mouseEventToLatLng(e as unknown as MouseEvent));
      preview.setBounds(b);
      preview.unbindTooltip();
      preview.bindTooltip(dimsLabel(boundsToObj(b)), { permanent: true, direction: "center", className: "site-picker-tooltip" }).openTooltip();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!start) return;
      e.stopPropagation();
      const b = L.latLngBounds(start, map.mouseEventToLatLng(e as unknown as MouseEvent));
      preview?.remove();
      preview = null;
      start = null;
      const bounds = boundsToObj(b);
      if (isUsable(bounds)) {
        onSelectRef.current(bounds);
        onDrawingChangeRef.current(false);
      }
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointerup", onPointerUp, true);
    return () => {
      window.clearTimeout(resize);
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointerup", onPointerUp, true);
      map.remove();
      mapRef.current = null;
      rectRef.current = null;
      handlesRef.current = [];
      layersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setView([view.lat, view.lon], view.zoom);
  }, [view.key]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = drawing ? "crosshair" : "";
  }, [drawing]);

  // "Select this view": the visible map minus a margin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectViewSignal === 0) return;
    const b = map.getBounds().pad(-0.12);
    const bounds = boundsToObj(b);
    if (isUsable(bounds)) onSelectRef.current(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectViewSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.forEach(layer => map.removeLayer(layer));
    const config = PICKER_LAYERS[imagery];
    const attribution = MAP_IMAGERY_SOURCES[imagery].attribution;
    const base = L.tileLayer(config.url, { maxZoom: 21, maxNativeZoom: config.maxNativeZoom, attribution });
    // Statewide 6-inch orthoimagery drawn over Esri inside its region (ImageServer exportImage per web-mercator tile).
    const stateLayers = imagery === "satellite"
      ? STATE_ORTHO_SOURCES.map(src => {
        const OrthoLayer = L.TileLayer.extend({
          getTileUrl(this: L.TileLayer, coords: L.Coords) {
            const size = 256;
            const nw = L.CRS.EPSG3857.project(map.unproject(L.point(coords.x * size, coords.y * size), coords.z));
            const se = L.CRS.EPSG3857.project(map.unproject(L.point((coords.x + 1) * size, (coords.y + 1) * size), coords.z));
            return `${src.services[0]}/exportImage?bbox=${nw.x},${se.y},${se.x},${nw.y}&bboxSR=3857&imageSR=3857&size=${size},${size}&format=png&transparent=true&f=image`;
          }
        });
        return new (OrthoLayer as any)("", {
          minZoom: 14,
          maxZoom: 21,
          maxNativeZoom: 20,
          bounds: L.latLngBounds([src.region.south, src.region.west], [src.region.north, src.region.east]),
          attribution: src.attribution
        }) as L.TileLayer;
      })
      : [];
    const overlays = config.overlays.map(url => L.tileLayer(url, { maxZoom: 21, maxNativeZoom: config.maxNativeZoom }));
    layersRef.current = [base, ...stateLayers, ...overlays];
    layersRef.current.forEach(layer => layer.addTo(map));
  }, [imagery]);

  // Selection rectangle with corner handles (resize) and a center handle (move).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    handlesRef.current.forEach(h => h.remove());
    handlesRef.current = [];
    if (!selection) {
      rectRef.current?.remove();
      rectRef.current = null;
      return;
    }
    const latLngBounds = L.latLngBounds([selection.south, selection.west], [selection.north, selection.east]);
    if (!rectRef.current) {
      rectRef.current = L.rectangle(latLngBounds, {
        color: "#10b981",
        weight: 3,
        fillColor: "#10b981",
        fillOpacity: 0.08,
        dashArray: "8 6",
        interactive: false
      }).addTo(map);
    } else {
      rectRef.current.setBounds(latLngBounds);
    }
    const rect = rectRef.current;
    const setLabel = (b: GeoBounds) => {
      rect.unbindTooltip();
      rect.bindTooltip(dimsLabel(b), { permanent: true, direction: "top", className: "site-picker-tooltip", offset: [0, -22] }).openTooltip(L.latLng(b.north, (b.west + b.east) / 2));
    };
    setLabel(selection);

    let live: GeoBounds = { ...selection };
    const cornerIcon = L.divIcon({ className: "site-handle site-handle-corner", iconSize: [16, 16] });
    const moveIcon = L.divIcon({ className: "site-handle site-handle-move", iconSize: [30, 30], html: "<span>✥</span>" });
    const corners: { key: "nw" | "ne" | "se" | "sw"; pos: () => L.LatLngExpression }[] = [
      { key: "nw", pos: () => [live.north, live.west] },
      { key: "ne", pos: () => [live.north, live.east] },
      { key: "se", pos: () => [live.south, live.east] },
      { key: "sw", pos: () => [live.south, live.west] }
    ];
    const markers: L.Marker[] = [];
    // Move handle sits on the top edge: the middle of the area is usually the house the user searched for.
    const center = () => L.latLng(live.north, (live.west + live.east) / 2);
    const refresh = (except?: L.Marker) => {
      rect.setBounds(L.latLngBounds([live.south, live.west], [live.north, live.east]));
      setLabel(live);
      corners.forEach((c, i) => { if (markers[i] !== except) markers[i].setLatLng(c.pos()); });
      if (markers[4] !== except) markers[4].setLatLng(center());
    };
    corners.forEach(c => {
      const marker = L.marker(c.pos(), { icon: cornerIcon, draggable: true, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      marker.on("drag", () => {
        const p = marker.getLatLng();
        if (c.key.includes("n")) live.north = p.lat; else live.south = p.lat;
        if (c.key.includes("w")) live.west = p.lng; else live.east = p.lng;
        const n = Math.max(live.north, live.south);
        const sth = Math.min(live.north, live.south);
        const e = Math.max(live.east, live.west);
        const w = Math.min(live.east, live.west);
        live = { north: n, south: sth, east: e, west: w };
        refresh(marker);
      });
      marker.on("dragend", () => { if (isUsable(live)) onSelectRef.current({ ...live }); else refresh(); });
      markers.push(marker);
    });
    const mover = L.marker(center(), { icon: moveIcon, draggable: true, keyboard: false, zIndexOffset: 1000, title: "Drag to move the area" }).addTo(map);
    let moveStart: L.LatLng | null = null;
    let startBounds = live;
    mover.on("dragstart", () => { moveStart = mover.getLatLng(); startBounds = { ...live }; });
    mover.on("drag", () => {
      if (!moveStart) return;
      const p = mover.getLatLng();
      const dLat = p.lat - moveStart.lat;
      const dLon = p.lng - moveStart.lng;
      live = { north: startBounds.north + dLat, south: startBounds.south + dLat, west: startBounds.west + dLon, east: startBounds.east + dLon };
      refresh(mover);
    });
    mover.on("dragend", () => onSelectRef.current({ ...live }));
    markers.push(mover);
    handlesRef.current = markers;
  }, [selection]);

  return <div ref={containerRef} className="absolute inset-0 bg-white/[0.07]" />;
}
