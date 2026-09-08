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
  elevationFt: number;
}

// Approximate coordinates/elevations — nice-to-have per spec §4, not
// authoritative.
export const TRAILHEADS: Trailhead[] = [
  { name: "Sibley Volcanic", lat: 37.8388, lon: -122.1811, elevationFt: 1100 },
  { name: "Redwood Regional (Skyline Gate)", lat: 37.8195, lon: -122.1646, elevationFt: 1210 },
  { name: "Tilden (Inspiration Point)", lat: 37.8973, lon: -122.2298, elevationFt: 1280 },
  { name: "Chabot (MacDonald Gate)", lat: 37.7936, lon: -122.1265, elevationFt: 940 },
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
