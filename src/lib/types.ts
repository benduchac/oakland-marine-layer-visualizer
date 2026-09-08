export interface SoundingRecord {
  stationId: string;
  launchTimeUTC: string;
  inversionHeightMeters: number | null;
  inversionHeightFeet: number | null;
  fetchedAt: string;
}

export interface GridSample {
  lat: number;
  lon: number;
  skyCoverPercent: number | null;
  ceilingHeightMeters: number | null;
}

export interface HrrrProxyRecord {
  validTime: string;
  samples: GridSample[];
  fetchedAt: string;
}
