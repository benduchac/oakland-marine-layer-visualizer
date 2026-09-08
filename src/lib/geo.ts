// Oakland/Berkeley hills trail network — see spec §4. Generous v1 bounds,
// intended to be narrowed once the map is up and running.
export const BOUNDS = {
  north: 37.91,
  south: 37.75,
  west: -122.28,
  east: -122.15,
};

export const KOAK_STATION_ID = "72493";
export const KOAK_LAT = 37.744;
export const KOAK_LON = -122.224;

export interface Trailhead {
  name: string;
  lat: number;
  lon: number;
}

// Elevation isn't stored here — it's queried live from the same Mapbox
// Terrain-RGB data the marine-layer overlay uses (see MarineLayerMap), so
// it's always consistent with what the map itself is showing at that point.
export const TRAILHEADS: Trailhead[] = [
  { name: "Steam Trains Overlook", lat: 37.879803, lon: -122.221572 },
  { name: "Piedmont Pines", lat: 37.82823, lon: -122.198951 },
  { name: "Grizzly Peak Log", lat: 37.872287, lon: -122.220358 },
];

export interface LatLon {
  lat: number;
  lon: number;
}

/** Evenly spaced size x size grid of points across BOUNDS, for Mode A sampling. */
export function buildSampleGrid(size = 5): LatLon[] {
  const points: LatLon[] = [];
  for (let i = 0; i < size; i++) {
    const lat = BOUNDS.south + ((BOUNDS.north - BOUNDS.south) * i) / (size - 1);
    for (let j = 0; j < size; j++) {
      const lon = BOUNDS.west + ((BOUNDS.east - BOUNDS.west) * j) / (size - 1);
      points.push({ lat, lon });
    }
  }
  return points;
}
