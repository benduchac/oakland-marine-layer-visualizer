"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { BOUNDS, TRAILHEADS } from "@/lib/geo";
import { LAYER_COLOR, LAYER_OVERLAY_ALPHA, UNCERTAIN_OVERLAY_ALPHA, hexToRgba255 } from "@/lib/colors";
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

interface OverlayColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Confirmed (RELH >= 97) marine layer — pale gray, near-opaque, so the wash
// reads as actual fog sitting on terrain rather than a red alert; matches
// Legend.tsx (src/lib/colors.ts is the shared source).
const CONFIRMED_OVERLAY_COLOR: OverlayColor = hexToRgba255(LAYER_COLOR, LAYER_OVERLAY_ALPHA);
// Uncertain cap (RELH >= 85 fallback, per sounding.ts) — same color, a
// slightly lighter wash, so it reads as "possible," not a confirmed
// detection, even though the height itself has checked out against real
// observations.
const UNCERTAIN_OVERLAY_COLOR: OverlayColor = hexToRgba255(LAYER_COLOR, UNCERTAIN_OVERLAY_ALPHA);

// terrainMap must be the hidden, BOUNDS-framed map (terrainMapRef) — not the
// visible one, whose queryTerrainElevation results depend on wherever the
// user has panned/zoomed it.
function buildPlaneOverlayDataUrl(terrainMap: mapboxgl.Map, heightMeters: number, color: OverlayColor): string | null {
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
      const elevation = terrainMap.queryTerrainElevation([lon, lat]);
      const idx = (row * OVERLAY_GRID_SIZE + col) * 4;

      if (elevation != null) resolvedCount++;

      // Below the plane: translucent color ("in the marine layer"). Above:
      // fully transparent, per spec §5.
      if (elevation != null && elevation < heightMeters) {
        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = color.a;
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

interface OverlaySpec {
  heightMeters: number;
  color: OverlayColor;
  key: string;
}

// Confirmed reading takes priority; the uncertain-cap fallback (sounding.ts)
// only ever exists when there's no confirmed one, but this order documents
// that explicitly rather than relying on that invariant silently.
function selectOverlaySpec(sounding: SoundingRecord | null): OverlaySpec | null {
  if (sounding?.inversionHeightMeters != null) {
    const h = sounding.inversionHeightMeters;
    return { heightMeters: h, color: CONFIRMED_OVERLAY_COLOR, key: `confirmed:${h}` };
  }
  if (sounding?.uncertainCapHeightMeters != null) {
    const h = sounding.uncertainCapHeightMeters;
    return { heightMeters: h, color: UNCERTAIN_OVERLAY_COLOR, key: `uncertain:${h}` };
  }
  return null;
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
  // Hidden, non-interactive map instance permanently framed to BOUNDS, used
  // only for queryTerrainElevation. mapboxgl only loads DEM tiles for a
  // map's current camera/viewport — if the visible map is used for this,
  // panning/zooming it away from part of BOUNDS makes elevation queries for
  // that area fail permanently (not just slowly), since those tiles were
  // never requested. Keeping a second map whose camera never moves avoids
  // that regardless of how the user navigates the visible one.
  const terrainContainerRef = useRef<HTMLDivElement | null>(null);
  const terrainMapRef = useRef<mapboxgl.Map | null>(null);
  const terrainLoadedRef = useRef(false);
  // Identifies what the plane overlay was last built for — height plus
  // whether it was the confirmed reading or the uncertain-cap fallback (they
  // render in different colors) — so a mode toggle can reuse it but a
  // genuinely new sounding value/tier triggers a rebuild.
  const renderedOverlayKeyRef = useRef<string | null>(null);

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
        el.style.background = "#0e7aab"; // accent-ink — ties trailhead pins to the same sky/clear color family
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

  // Initialize the hidden terrain-sampling map once, framed to BOUNDS and
  // never moved again. No visual style needed — just the DEM source.
  useEffect(() => {
    if (!terrainContainerRef.current || !mapboxToken || terrainMapRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const terrainMap = new mapboxgl.Map({
      container: terrainContainerRef.current,
      style: { version: 8, sources: {}, layers: [] },
      bounds: [
        [BOUNDS.west, BOUNDS.south],
        [BOUNDS.east, BOUNDS.north],
      ],
      interactive: false,
      attributionControl: false,
    });
    terrainMapRef.current = terrainMap;

    terrainMap.on("load", () => {
      terrainMap.addSource(DEM_SOURCE_ID, {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      terrainMap.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1 });
      terrainLoadedRef.current = true;
    });

    return () => {
      terrainMap.remove();
      terrainMapRef.current = null;
      terrainLoadedRef.current = false;
    };
  }, [mapboxToken]);

  // Query real terrain elevation for each trailhead once the hidden terrain
  // map's DEM tiles are available, and report it up. Sampled from the
  // hidden map (see terrainMapRef above), not the visible one, so this
  // isn't affected by how the user has panned/zoomed the visible map.
  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    // No hard cap — see the plane-overlay effect below for why.
    const WARN_AFTER_RETRIES = 20;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const queryElevations = () => {
      if (cancelled) return;
      const terrainMap = terrainMapRef.current;

      // Also wait on the visible map (loadedRef) — trailhead markers are
      // created there, and we're about to update their popups below.
      if (!terrainMap || !terrainLoadedRef.current || !loadedRef.current) {
        // Hidden terrain map hasn't finished its own setup yet — its 'idle'
        // event isn't usable until then, so just poll briefly.
        pendingTimer = setTimeout(queryElevations, 200);
        return;
      }

      const results: TrailheadElevation[] = TRAILHEADS.map((t) => {
        const elevationM = terrainMap.queryTerrainElevation([t.lon, t.lat]);
        return { ...t, elevationFt: elevationM != null ? elevationM * METERS_TO_FEET : null };
      });

      const allResolved = results.every((r) => r.elevationFt != null);
      if (!allResolved) {
        retries += 1;
        if (retries === WARN_AFTER_RETRIES) {
          console.warn(
            `[MarineLayerMap] trailhead elevation query still unresolved after ${retries} idle retries — terrain DEM tiles may be stuck.`
          );
        }
        terrainMap.once("idle", queryElevations);
        terrainMap.triggerRepaint();
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

    queryElevations();

    return () => {
      cancelled = true;
      if (pendingTimer != null) clearTimeout(pendingTimer);
    };
  }, [onTrailheadElevations]);

  // Toggle layer visibility + rebuild the Mode B overlay when relevant data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Elevation is sampled from the hidden terrain map (terrainMapRef), not
    // this visible one — see its declaration above for why. That map's DEM
    // tiles may still be loading — 'idle' doesn't guarantee they've
    // resolved, so a first attempt can come back mostly/fully transparent.
    // No hard retry cap: keep retrying on every future 'idle' until it
    // succeeds or this effect is superseded/unmounted — 'idle' only fires on
    // genuine render-settle events, so this doesn't busy-loop. A prior fixed
    // cap here gave up permanently after 8 tries, leaving a stale/blank
    // overlay stuck until a full page reload.
    const WARN_AFTER_OVERLAY_RETRIES = 20;
    let cancelled = false;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const rebuildPlaneOverlay = () => {
      if (cancelled) return;

      const terrainMap = terrainMapRef.current;
      if (!terrainMap || !terrainLoadedRef.current) {
        // Hidden terrain map hasn't finished its own setup yet — its 'idle'
        // event isn't usable until then, so just poll briefly.
        pendingTimer = setTimeout(rebuildPlaneOverlay, 200);
        return;
      }

      const overlaySpec = selectOverlaySpec(sounding);
      if (!overlaySpec) return; // nothing to render — applyVisibility already hid the layer

      const dataUrl = buildPlaneOverlayDataUrl(terrainMap, overlaySpec.heightMeters, overlaySpec.color);
      if (!dataUrl) {
        overlayRetriesRef.current += 1;
        if (overlayRetriesRef.current === WARN_AFTER_OVERLAY_RETRIES) {
          console.warn(
            `[MarineLayerMap] plane overlay still unresolved after ${overlayRetriesRef.current} idle retries — terrain DEM tiles may be stuck.`
          );
        }
        terrainMap.once("idle", rebuildPlaneOverlay);
        // 'idle' only fires after a render; if nothing else is queued to
        // render, it may never fire on its own, so force one.
        terrainMap.triggerRepaint();
        return;
      }
      overlayRetriesRef.current = 0;
      renderedOverlayKeyRef.current = overlaySpec.key;

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

      const overlaySpec = selectOverlaySpec(sounding);
      const showPlane = mode === "sounding" && overlaySpec != null;
      if (!showPlane) {
        if (map.getLayer(PLANE_LAYER_ID)) {
          map.setLayoutProperty(PLANE_LAYER_ID, "visibility", "none");
        }
        return;
      }

      if (map.getSource(PLANE_SOURCE_ID) && renderedOverlayKeyRef.current === overlaySpec.key) {
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
      if (pendingTimer != null) clearTimeout(pendingTimer);
    };
  }, [mode, sounding, hrrr]);

  // Keep the HRRR heatmap source data current as new samples arrive.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(HRRR_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(hrrrToGeoJSON(hrrr));
  }, [hrrr]);

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {/* Hidden terrain-sampling map — never shown, must stay off-screen
          rather than display:none so its WebGL context initializes normally. */}
      <div
        ref={terrainContainerRef}
        aria-hidden="true"
        style={{ position: "fixed", top: 0, left: "-99999px", width: "1024px", height: "1024px" }}
      />
    </>
  );
}
