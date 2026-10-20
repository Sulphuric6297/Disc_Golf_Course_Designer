import { SiteLocation, fetchJson } from "./core";


// Accepts "lat, lon", a Google Maps / Apple Maps / OSM link, or a plain address (geocoded via OpenStreetMap).
// --- Address search (free, keyless; several providers so one outage or gap doesn't break search) ---

export type PlaceSuggestion = { text: string; detail?: string; lat?: number; lon?: number; magicKey?: string };

export const isValidLatLon = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

// Coordinates or a map link (Google/Apple/OSM) typed or pasted into the search box.
export const parseCoordinateInput = (text: string): SiteLocation | null => {
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // Google Maps pin
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // Google Maps view center
    /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i, // ?q=lat,lon
    /[#&]map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/, // openstreetmap.org/#map=z/lat/lon
    /^\s*(-?\d+(?:\.\d+)?)°?\s*[, ]\s*(-?\d+(?:\.\d+)?)°?\s*$/ // "lat, lon"
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (isValidLatLon(lat, lon)) return { lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
    }
  }
  return null;
};

export const ESRI_GEOCODER = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

// Esri World Geocoder: strongest for US street addresses, including rural routes.
export const esriFindCandidates = async (text: string, near?: { lat: number; lon: number }, magicKey?: string): Promise<SiteLocation[]> => {
  const params = new URLSearchParams({ SingleLine: text, f: "json", maxLocations: "5", outFields: "Match_addr,Addr_type" });
  if (magicKey) params.set("magicKey", magicKey);
  if (near) params.set("location", `${near.lon},${near.lat}`);
  const json = await fetchJson(`${ESRI_GEOCODER}/findAddressCandidates?${params.toString()}`);
  return (json.candidates ?? [])
    .filter((c: any) => c.score >= 70 && isValidLatLon(c.location?.y, c.location?.x))
    .map((c: any) => ({ lat: c.location.y, lon: c.location.x, label: c.address || text }));
};

// US Census geocoder: official US address ranges. Called via JSONP because it doesn't send CORS headers.
export const censusFindCandidates = (text: string): Promise<SiteLocation[]> =>
  new Promise((resolve, reject) => {
    const callback = `__censusGeocode${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete (window as any)[callback];
      script.remove();
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("Census timeout")); }, 8000);
    (window as any)[callback] = (json: any) => {
      cleanup();
      const matches = json?.result?.addressMatches ?? [];
      resolve(matches
        .filter((m: any) => isValidLatLon(m.coordinates?.y, m.coordinates?.x))
        .map((m: any) => ({ lat: m.coordinates.y, lon: m.coordinates.x, label: m.matchedAddress || text })));
    };
    script.onerror = () => { cleanup(); reject(new Error("Census unavailable")); };
    script.src = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({
      address: text,
      benchmark: "Public_AR_Current",
      format: "jsonp",
      callback
    }).toString()}`;
    document.head.appendChild(script);
  });

// Photon (OpenStreetMap-based): good for places, roads and towns; supports a location bias.
export const photonSearch = async (text: string, near?: { lat: number; lon: number }, limit = 5): Promise<PlaceSuggestion[]> => {
  const params = new URLSearchParams({ q: text, limit: String(limit), lang: "en" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
  }
  const json = await fetchJson(`https://photon.komoot.io/api/?${params.toString()}`);
  return (json.features ?? []).map((f: any) => {
    const p = f.properties ?? {};
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const title = p.name || street || p.city || text;
    const detail = [p.name && street ? street : null, p.city || p.county, p.state, p.postcode].filter(Boolean).join(", ");
    return { text: title, detail, lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1] };
  }).filter((s: PlaceSuggestion) => isValidLatLon(s.lat as number, s.lon as number));
};

export const nominatimSearch = async (text: string): Promise<SiteLocation[]> => {
  const json = await fetchJson(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(text)}`);
  return (Array.isArray(json) ? json : [])
    .map((r: any) => ({ lat: parseFloat(r.lat), lon: parseFloat(r.lon), label: r.display_name || text }))
    .filter((r: SiteLocation) => isValidLatLon(r.lat, r.lon));
};

// Suggestions while typing: Esri first (addresses), Photon as backup (places).
export const fetchPlaceSuggestions = async (text: string, near?: { lat: number; lon: number }): Promise<PlaceSuggestion[]> => {
  if (text.trim().length < 3 || parseCoordinateInput(text)) return [];
  try {
    const params = new URLSearchParams({ text, f: "json", maxSuggestions: "6" });
    if (near) params.set("location", `${near.lon},${near.lat}`);
    const json = await fetchJson(`${ESRI_GEOCODER}/suggest?${params.toString()}`, 5000);
    const list: PlaceSuggestion[] = (json.suggestions ?? [])
      .filter((s: any) => !s.isCollection)
      .map((s: any) => {
        const [first, ...rest] = String(s.text).split(", ");
        return { text: first, detail: rest.join(", "), magicKey: s.magicKey };
      });
    if (list.length > 0) return list;
  } catch {
    // fall back to Photon
  }
  try {
    return await photonSearch(text, near, 6);
  } catch {
    return [];
  }
};

// Resolves typed text (or a picked suggestion) to a location, trying each provider in turn.
export const resolveSiteLocation = async (
  input: string,
  options?: { near?: { lat: number; lon: number }; suggestion?: PlaceSuggestion }
): Promise<SiteLocation> => {
  const text = input.trim();
  if (!text) throw new Error("Enter an address, coordinates, or a map link.");
  const coords = parseCoordinateInput(text);
  if (coords) return coords;
  const suggestion = options?.suggestion;
  if (suggestion && isValidLatLon(suggestion.lat as number, suggestion.lon as number)) {
    return { lat: suggestion.lat as number, lon: suggestion.lon as number, label: [suggestion.text, suggestion.detail].filter(Boolean).join(", ") };
  }
  const attempts: (() => Promise<SiteLocation[]>)[] = [
    () => esriFindCandidates(text, options?.near, suggestion?.magicKey),
    () => censusFindCandidates(text),
    () => photonSearch(text, options?.near, 1).then(list => list.map(s => ({
      lat: s.lat as number,
      lon: s.lon as number,
      label: [s.text, s.detail].filter(Boolean).join(", ")
    }))),
    () => nominatimSearch(text)
  ];
  for (const attempt of attempts) {
    try {
      const results = await attempt();
      if (results.length > 0) return results[0];
    } catch (err) {
      console.info("Geocoder unavailable, trying the next one", err);
    }
  }
  throw new Error("Couldn't find that place.");
};
