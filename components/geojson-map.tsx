"use client";

import { useMemo, useRef, useState } from "react";
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
  const [showNoFlyZones, setShowNoFlyZones] = useState(true);

  const bounds = useMemo(() => {
    const allCoordinates = [...preview.routeGeoJson.features, ...preview.noFlyZonesGeoJson.features]
      .flatMap((feature) => flattenCoordinates(feature.geometry.coordinates));

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

  const hasNoFlyZones = preview.noFlyZonesGeoJson.features.some(
    (feature) => feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"
  );

  const noFlySummary = useMemo(() => {
    const polygonFeatures = preview.noFlyZonesGeoJson.features.filter(
      (feature) => feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"
    );

    return {
      aircraftCurrent: polygonFeatures.filter(
        (feature) => String(feature.properties.type ?? "") === "aircraft_no_fly_zone"
      ).length,
      aircraftPredicted: polygonFeatures.filter(
        (feature) =>
          String(feature.properties.type ?? "") === "aircraft_predicted_no_fly_zone" ||
          String(feature.properties.type ?? "") === "aircraft_predicted_path_buffer"
      ).length,
      fixed: polygonFeatures.filter((feature) => {
        const type = String(feature.properties.type ?? "");
        return (
          type !== "aircraft_no_fly_zone" &&
          type !== "aircraft_predicted_no_fly_zone" &&
          type !== "aircraft_predicted_path_buffer"
        );
      }).length,
    };
  }, [preview.noFlyZonesGeoJson.features]);

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
        Live map rendered from GeoJSON returned by your Python planner, including the route,
        pickup/dropoff markers, and visible no-fly overlays.
      </p>
      {hasNoFlyZones ? (
        <p className="panel-subtle" style={{ marginTop: 8 }}>
          The orange circles come from predicted aircraft no-fly zones over time. Each circle is
          one future aircraft position safety buffer, so long chains of circles mean the plane
          forecast spans multiple timestamps.
        </p>
      ) : null}
      <div className="chip-row" style={{ margin: "12px 0 16px" }}>
        <button
          className="secondary-button"
          onClick={() => setShowNoFlyZones((current) => !current)}
          type="button"
        >
          {showNoFlyZones ? "Hide no-fly zones" : "Show no-fly zones"}
        </button>
        {hasNoFlyZones ? (
          <>
            {noFlySummary.aircraftCurrent > 0 ? (
              <span className="chip">Current aircraft zones {noFlySummary.aircraftCurrent}</span>
            ) : null}
            {noFlySummary.aircraftPredicted > 0 ? (
              <span className="chip">Predicted zones {noFlySummary.aircraftPredicted}</span>
            ) : null}
            {noFlySummary.fixed > 0 ? (
              <span className="chip">Fixed zones {noFlySummary.fixed}</span>
            ) : null}
          </>
        ) : (
          <span className="chip">No no-fly polygons returned</span>
        )}
      </div>

      <div className="map-live-shell">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={initialViewState}
          style={{ width: "100%", height: "420px" }}
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

          {showNoFlyZones ? (
            <Source id="no-fly-source" type="geojson" data={preview.noFlyZonesGeoJson}>
              <Layer
                id="no-fly-fill"
                type="fill"
                filter={[
                  "any",
                  ["==", ["geometry-type"], "Polygon"],
                  ["==", ["geometry-type"], "MultiPolygon"],
                ]}
                paint={{
                  "fill-color": [
                    "match",
                    ["get", "type"],
                    "aircraft_no_fly_zone",
                    "#ef4444",
                    "aircraft_predicted_no_fly_zone",
                    "#f97316",
                    "aircraft_predicted_path_buffer",
                    "#fb923c",
                    "#7c3aed",
                  ],
                  "fill-opacity": [
                    "match",
                    ["get", "type"],
                    "aircraft_no_fly_zone",
                    0.18,
                    "aircraft_predicted_no_fly_zone",
                    0.12,
                    "aircraft_predicted_path_buffer",
                    0.1,
                    0.12,
                  ],
                }}
              />
              <Layer
                id="no-fly-outline"
                type="line"
                filter={[
                  "any",
                  ["==", ["geometry-type"], "Polygon"],
                  ["==", ["geometry-type"], "MultiPolygon"],
                ]}
                paint={{
                  "line-color": [
                    "match",
                    ["get", "type"],
                    "aircraft_no_fly_zone",
                    "#dc2626",
                    "aircraft_predicted_no_fly_zone",
                    "#ea580c",
                    "aircraft_predicted_path_buffer",
                    "#f97316",
                    "#6d28d9",
                  ],
                  "line-width": 2,
                  "line-opacity": 0.7,
                }}
              />
            </Source>
          ) : null}

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
            {hasNoFlyZones ? (
              <span className="chip">
                No-fly overlays {showNoFlyZones ? "visible" : "hidden"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
