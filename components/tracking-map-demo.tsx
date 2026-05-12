"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getRouteLineCoordinates, positionAlongRoute } from "@/lib/tracking-demo";
import type { PreviewResult } from "@/lib/types";

type TrackingMapDemoProps = {
  preview: PreviewResult;
  progress: number;
};

export function TrackingMapDemo({ preview, progress }: TrackingMapDemoProps) {
  const mapRef = useRef<MapRef | null>(null);
  const coords = useMemo(() => getRouteLineCoordinates(preview), [preview]);
  const drone = useMemo(() => positionAlongRoute(coords, progress), [coords, progress]);

  const routeFc = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: coords },
        },
      ],
    }),
    [coords]
  );

  const bounds = useMemo(() => {
    if (coords.length === 0) {
      return null;
    }
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return {
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    };
  }, [coords]);

  const initialViewState = useMemo(() => {
    if (!bounds) {
      return { longitude: 114.1694, latitude: 22.3193, zoom: 11.5 };
    }
    return {
      longitude: (bounds.minLng + bounds.maxLng) / 2,
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      zoom: 12.2,
    };
  }, [bounds]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !bounds) {
      return;
    }
    const id = requestAnimationFrame(() => {
      try {
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          { padding: 72, duration: 0, maxZoom: 13 }
        );
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(id);
    // Do not depend on `progress`: fitBounds every frame would reset user zoom/pan.
  }, [bounds]);

  if (coords.length < 2) {
    return (
      <div className="panel">
        <p className="panel-subtle">No route line in preview; delivery animation is unavailable.</p>
      </div>
    );
  }

  return (
    <div className="map-live-shell" style={{ borderRadius: 16, overflow: "hidden" }}>
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={initialViewState}
        style={{ width: "100%", height: 420 }}
        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
      >
        <NavigationControl position="top-right" />
        <Source id="tracking-demo-route" type="geojson" data={routeFc}>
          <Layer
            id="tracking-demo-route-line"
            type="line"
            paint={{
              "line-color": "#155eef",
              "line-width": 4,
              "line-opacity": 0.92,
            }}
          />
        </Source>
        <Marker anchor="center" latitude={drone[1]} longitude={drone[0]}>
          <div
            className="geo-marker waypoint"
            style={{ boxShadow: "0 0 0 3px rgba(21, 94, 239, 0.4)" }}
            title="UAV (demo)"
          />
        </Marker>
      </Map>
      <div className="map-callout map-callout-floating">
        <strong>Live demo</strong>
        <p className="panel-subtle" style={{ marginTop: 6 }}>
          UAV moving along the planned route for about one minute (mock).
        </p>
      </div>
    </div>
  );
}
