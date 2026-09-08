"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { BOUNDS, TRAILHEADS } from "@/lib/geo";
import type { ViewMode } from "@/lib/mode";
import type { HrrrProxyRecord, SoundingRecord, TrailheadElevation } from "@/lib/types";

const METERS_TO_FEET = 3.28084;

const DEM_SOURCE_ID = "marine-layer-dem";
const PLANE_SOURCE_ID = "marine-layer-plane";
const PLANE_LAYER_ID = "marine-layer-plane-layer";
const HRRR_SOURCE_ID = "marine-layer-hrrr-points";
const HRRR_LAYER_ID = "marine-layer-hrrr-heatmap";

// Resolution of the flat-plane overlay raster (Mode B). Coarse enough to
// stay fast; queryTerrainElevation is called once per cell.
const OVERLAY_GRID_SIZE = 72;

// image source corners: [top-left, top-right, bottom-right, bottom-left]
const OVERLAY_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [BOUNDS.west, BOUNDS.north],
  [BOUNDS.east, BOUNDS.north],
  [BOUNDS.east, BOUNDS.south],
  [BOUNDS.west, BOUNDS.south],
];

// Below this fraction of resolved (non-null) elevation samples, terrain DEM
// tiles for the current view likely haven't finished loading yet — the
// caller should retry rather than render a mostly/fully transparent overlay.
const MIN_RESOLVED_FRACTION = 0.9;

function buildPlaneOverlayDataUrl(map: mapboxgl.Map, inversionHeightMeters: number): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = OVERLAY_GRID_SIZE;
  canvas.height = OVERLAY_GRID_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = ctx.createImageData(OVERLAY_GRID_SIZE, OVERLAY_GRID_SIZE);
  let resolvedCount = 0;
  for (let row = 0; row < OVERLAY_GRID_SIZE; row++) {
    const lat = BOUNDS.north - ((BOUNDS.north - BOUNDS.south) * row) / (OVERLAY_GRID_SIZE - 1);
    for (let col = 0; col < OVERLAY_GRID_SIZE; col++) {
      const lon = BOUNDS.west + ((BOUNDS.east - BOUNDS.west) * col) / (OVERLAY_GRID_SIZE - 1);
      const elevation = map.queryTerrainElevation([lon, lat]);
      const idx = (row * OVERLAY_GRID_SIZE + col) * 4;

      if (elevation != null) resolvedCount++;

      // Below the plane: translucent red ("in the marine layer"). Above:
      // fully transparent, per spec §5.
      if (elevation != null && elevation < inversionHeightMeters) {
        imageData.data[idx] = 200;
        imageData.data[idx + 1] = 60;
        imageData.data[idx + 2] = 60;
        imageData.data[idx + 3] = 130;
      } else {
        imageData.data[idx + 3] = 0;
      }
    }
  }

  const totalCells = OVERLAY_GRID_SIZE * OVERLAY_GRID_SIZE;
  if (resolvedCount / totalCells < MIN_RESOLVED_FRACTION) return null;

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

function hrrrToGeoJSON(hrrr: HrrrProxyRecord | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: (hrrr?.samples ?? [])
      .filter((s) => s.skyCoverPercent != null)
      .map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { skyCoverPercent: s.skyCoverPercent },
      })),
  };
}

interface MarineLayerMapProps {
  mapboxToken: string;
  mode: ViewMode;
  sounding: SoundingRecord | null;
  hrrr: HrrrProxyRecord | null;
  onTrailheadElevations?: (elevations: TrailheadElevation[]) => void;
}

export default function MarineLayerMap({
  mapboxToken,
  mode,
  sounding,
  hrrr,
  onTrailheadElevations,
}: MarineLayerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const loadedRef = useRef(false);
  const overlayRetriesRef = useRef(0);
  // Inversion height (meters) the plane overlay was last built for, so a
  // mode toggle can reuse it but a new sounding value triggers a rebuild.
  const renderedInversionRef = useRef<number | null>(null);

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || !mapboxToken || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      bounds: [
        [BOUNDS.west, BOUNDS.south],
        [BOUNDS.east, BOUNDS.north],
      ],
      fitBoundsOptions: { padding: 24 },
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(DEM_SOURCE_ID, {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1 });

      map.addSource(HRRR_SOURCE_ID, { type: "geojson", data: hrrrToGeoJSON(hrrr) });
      map.addLayer({
        id: HRRR_LAYER_ID,
        type: "heatmap",
        source: HRRR_SOURCE_ID,
        layout: { visibility: mode === "hrrr" ? "visible" : "none" },
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "skyCoverPercent"], 0, 0, 100, 1],
          "heatmap-intensity": 1,
          "heatmap-radius": 60,
          "heatmap-opacity": 0.75,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.3,
            "rgba(180,200,255,0.4)",
            0.6,
            "rgba(120,150,230,0.65)",
            1,
            "rgba(90,90,200,0.85)",
          ],
        },
      });

      for (const trailhead of TRAILHEADS) {
        const el = document.createElement("div");
        el.style.width = "10px";
        el.style.height = "10px";
        el.style.borderRadius = "50%";
        el.style.background = "#1d4ed8";
        el.style.border = "2px solid white";
        el.style.boxShadow = "0 0 2px rgba(0,0,0,0.5)";
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([trailhead.lon, trailhead.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<strong>${trailhead.name}</strong><br/>Loading elevation…`))
          .addTo(map);
        markersRef.current.set(trailhead.name, marker);
      }

      loadedRef.current = true;
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // Only re-run if the token changes (map must be recreated).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken]);

  // Query real terrain elevation for each trailhead once DEM tiles are
  // available, and report it up. Retries with a forced repaint for the same
  // reason the plane overlay does — 'idle' can fire before terrain tiles for
  // these exact points have loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    let retries = 0;
    const MAX_RETRIES = 8;

    const queryElevations = () => {
      if (cancelled) return;

      const results: TrailheadElevation[] = TRAILHEADS.map((t) => {
        const elevationM = map.queryTerrainElevation([t.lon, t.lat]);
        return { ...t, elevationFt: elevationM != null ? elevationM * METERS_TO_FEET : null };
      });

      const allResolved = results.every((r) => r.elevationFt != null);
      if (!allResolved && retries < MAX_RETRIES) {
        retries += 1;
        map.once("idle", queryElevations);
        map.triggerRepaint();
        return;
      }

      for (const r of results) {
        if (r.elevationFt == null) continue;
        markersRef.current
          .get(r.name)
          ?.setPopup(
            new mapboxgl.Popup({ offset: 12 }).setHTML(`<strong>${r.name}</strong><br/>~${Math.round(r.elevationFt).toLocaleString()} ft`)
          );
      }
      onTrailheadElevations?.(results);
    };

    if (loadedRef.current) {
      map.once("idle", queryElevations);
      map.triggerRepaint();
    } else {
      map.once("load", () => {
        map.once("idle", queryElevations);
        map.triggerRepaint();
      });
    }

    return () => {
      cancelled = true;
    };
  }, [onTrailheadElevations]);

  // Toggle layer visibility + rebuild the Mode B overlay when relevant data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Terrain DEM tiles for the current view may still be loading — 'idle'
    // doesn't guarantee they've resolved, so a first attempt can come back
    // mostly/fully transparent. Retry a bounded number of times as more
    // tiles arrive rather than leaving a stale or blank overlay.
    const MAX_OVERLAY_RETRIES = 8;
    let cancelled = false;

    const rebuildPlaneOverlay = () => {
      if (cancelled) return;

      const inversionHeightMeters = sounding?.inversionHeightMeters;
      const dataUrl = buildPlaneOverlayDataUrl(map, inversionHeightMeters!);
      if (!dataUrl) {
        if (overlayRetriesRef.current < MAX_OVERLAY_RETRIES) {
          overlayRetriesRef.current += 1;
          map.once("idle", rebuildPlaneOverlay);
          // 'idle' only fires after a render; if nothing else is queued to
          // render, it may never fire on its own, so force one.
          map.triggerRepaint();
        }
        return;
      }
      overlayRetriesRef.current = 0;
      renderedInversionRef.current = inversionHeightMeters!;

      const existing = map.getSource(PLANE_SOURCE_ID) as mapboxgl.ImageSource | undefined;
      if (existing) {
        existing.updateImage({ url: dataUrl, coordinates: OVERLAY_COORDINATES });
      } else {
        map.addSource(PLANE_SOURCE_ID, { type: "image", url: dataUrl, coordinates: OVERLAY_COORDINATES });
        map.addLayer({
          id: PLANE_LAYER_ID,
          type: "raster",
          source: PLANE_SOURCE_ID,
          paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
        });
      }
      map.setLayoutProperty(PLANE_LAYER_ID, "visibility", "visible");
    };

    // Visibility toggling is cheap and doesn't depend on terrain tiles being
    // loaded, so apply it immediately rather than waiting on 'idle'.
    const applyVisibility = () => {
      if (map.getLayer(HRRR_LAYER_ID)) {
        map.setLayoutProperty(HRRR_LAYER_ID, "visibility", mode === "hrrr" ? "visible" : "none");
      }

      const inversionHeightMeters = sounding?.inversionHeightMeters;
      const showPlane = mode === "sounding" && inversionHeightMeters != null;
      if (!showPlane) {
        if (map.getLayer(PLANE_LAYER_ID)) {
          map.setLayoutProperty(PLANE_LAYER_ID, "visibility", "none");
        }
        return;
      }

      if (map.getSource(PLANE_SOURCE_ID) && renderedInversionRef.current === inversionHeightMeters) {
        map.setLayoutProperty(PLANE_LAYER_ID, "visibility", "visible");
      } else {
        overlayRetriesRef.current = 0;
        rebuildPlaneOverlay();
      }
    };

    if (loadedRef.current) {
      applyVisibility();
    } else {
      map.once("load", applyVisibility);
    }

    return () => {
      cancelled = true;
    };
  }, [mode, sounding, hrrr]);

  // Keep the HRRR heatmap source data current as new samples arrive.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(HRRR_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(hrrrToGeoJSON(hrrr));
  }, [hrrr]);

  return <div ref={containerRef} className="h-full w-full" />;
}
