export interface SoundingProfileLevel {
  heightFeet: number;
  tempF: number | null;
  dewpointF: number | null;
  relh: number | null;
}

export interface SoundingRecord {
  stationId: string;
  launchTimeUTC: string;
  inversionHeightMeters: number | null;
  inversionHeightFeet: number | null;
  uncertainCapHeightMeters: number | null;
  uncertainCapHeightFeet: number | null;
  onshoreFlowNearInversion: boolean;
  fetchedAt: string;
  // 0-2000ft simplified profile for the tap-through sounding view. Optional
  // because records written before this field existed (in Blob storage or
  // local .data/) won't have it until the next cron run overwrites them.
  profile?: SoundingProfileLevel[];
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

export interface TrailheadElevation {
  name: string;
  lat: number;
  lon: number;
  elevationFt: number | null;
}
