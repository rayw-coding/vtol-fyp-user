"use client";

import { useMemo, useRef } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJsonFeature, PreviewResult } from "@/lib/types";

const hkFallbackView = {
  longitude: 114.1694,
  latitude: 22.3193,
  zoom: 11.5,
};

function flattenCoordinates(input: unknown): number[][] {
  if (!Array.isArray(input)) {
    return [];
  }

  if (
    input.length >= 2 &&
    typeof input[0] === "number" &&
    typeof input[1] === "number"
  ) {
    return [[input[0], input[1]]];
  }

  return input.flatMap((item) => flattenCoordinates(item));
}

function getFeatureCenter(feature: GeoJsonFeature): [number, number] | null {
  const coordinates = flattenCoordinates(feature.geometry.coordinates);
  if (coordinates.length === 0) {
    return null;
  }

  const total = coordinates.reduce(
    (acc, current) => [acc[0] + current[0], acc[1] + current[1]],
    [0, 0]
  );

  return [total[0] / coordinates.length, total[1] / coordinates.length];
}

export function GeoJsonMap({ preview }: { preview: PreviewResult }) {
  const mapRef = useRef<MapRef | null>(null);

  const bounds = useMemo(() => {
    const allCoordinates = preview.routeGeoJson.features.flatMap((feature) =>
      flattenCoordinates(feature.geometry.coordinates)
    );

    if (allCoordinates.length === 0) {
      return null;
    }

    const longitudes = allCoordinates.map((coordinate) => coordinate[0]);
    const latitudes = allCoordinates.map((coordinate) => coordinate[1]);

    return {
      minLng: Math.min(...longitudes),
      maxLng: Math.max(...longitudes),
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
    };
  }, [preview.routeGeoJson.features]);

  const pointFeatures = useMemo(
    () =>
      preview.routeGeoJson.features.filter(
        (feature) => feature.geometry.type === "Point"
      ),
    [preview.routeGeoJson.features]
  );

  const initialViewState = useMemo(() => {
    if (!bounds) {
      return hkFallbackView;
    }

    return {
      longitude: (bounds.minLng + bounds.maxLng) / 2,
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      zoom: 12.5,
    };
  }, [bounds]);

  return (
    <div className="map-card">
      <div className="chip-row" style={{ marginBottom: 16 }}>
        <span className="chip">GeoJSON map</span>
        <span className={`tag ${preview.noFlyCheckPassed ? "success" : "danger"}`}>
          {preview.noFlyCheckPassed ? "No-fly check passed" : "No-fly conflict"}
        </span>
        <span className={`tag ${preview.riskLevel === "low" ? "success" : "warning"}`}>
          Risk {preview.riskLevel}
        </span>
      </div>
      <h3>Route preview</h3>
      <p className="panel-subtle">
        Live map rendered from backend `GeoJSON`, including the Python-generated route and
        pickup/dropoff markers.
      </p>

      <div className="map-live-shell">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={initialViewState}
          style={{ width: "100%", height: "100%" }}
          mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
          onLoad={() => {
            if (!mapRef.current || !bounds) {
              return;
            }

            mapRef.current.fitBounds(
              [
                [bounds.minLng, bounds.minLat],
                [bounds.maxLng, bounds.maxLat],
              ],
              {
                padding: 72,
                duration: 0,
              }
            );
          }}
        >
          <NavigationControl position="top-right" />

          <Source id="route-source" type="geojson" data={preview.routeGeoJson}>
            <Layer
              id="route-line"
              type="line"
              filter={["==", ["geometry-type"], "LineString"]}
              paint={{
                "line-color": "#155eef",
                "line-width": 4,
                "line-opacity": 0.95,
              }}
            />
          </Source>

          {pointFeatures.map((feature, index) => {
            const center = getFeatureCenter(feature);
            if (!center) {
              return null;
            }

            const label =
              String(feature.properties.type ?? "") === "start_point"
                ? "Pickup"
                : String(feature.properties.type ?? "") === "goal_point"
                  ? "Dropoff"
                  : `Point ${index + 1}`;

            const markerClass =
              label === "Pickup" ? "pickup" : label === "Dropoff" ? "dropoff" : "waypoint";

            return (
              <Marker key={`${label}-${index}`} longitude={center[0]} latitude={center[1]}>
                <div className={`geo-marker ${markerClass}`} />
              </Marker>
            );
          })}

          {pointFeatures.map((feature, index) => {
            const center = getFeatureCenter(feature);
            if (!center) {
              return null;
            }

            return (
              <Popup
                key={`popup-${index}`}
                longitude={center[0]}
                latitude={center[1]}
                closeButton={false}
                closeOnClick={false}
                anchor="top"
                offset={14}
              >
                <div className="map-popup">
                  <strong>{String(feature.properties.type ?? "point")}</strong>
                </div>
              </Popup>
            );
          })}
        </Map>

        <div className="map-callout map-callout-floating">
          <strong>{preview.droneId}</strong>
          <p style={{ margin: "8px 0 10px", color: "var(--muted)" }}>
            {preview.droneModel} with {preview.batteryLevel}% battery is currently selected
            for this mission.
          </p>
          <div className="chip-row">
            <span className="chip">{preview.distanceKm} km</span>
            <span className="chip">{preview.etaMinutes} min</span>
            <span className="chip">HK${preview.priceHkd}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
