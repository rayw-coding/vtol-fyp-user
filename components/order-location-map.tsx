"use client";

import { useCallback, useMemo, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const hkBounds = {
  minLng: 113.75,
  maxLng: 114.5,
  minLat: 22.15,
  maxLat: 22.6,
} as const;

const initialView = {
  longitude: 114.1694,
  latitude: 22.3193,
  zoom: 11.2,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function formatCoord(n: number) {
  return n.toFixed(6);
}

function parseLngLat(latStr: string, lngStr: string): [number, number] | null {
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return [lng, lat];
}

type ActivePoint = "pickup" | "dropoff";

export type OrderLocationMapPickerProps = {
  pickupLat: string;
  pickupLng: string;
  dropoffLat: string;
  dropoffLng: string;
  onPlacePickup: (lat: string, lng: string) => void;
  onPlaceDropoff: (lat: string, lng: string) => void;
};

export function OrderLocationMapPicker({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  onPlacePickup,
  onPlaceDropoff,
}: OrderLocationMapPickerProps) {
  const [active, setActive] = useState<ActivePoint>("pickup");

  const onMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const { lng, lat } = event.lngLat;
      const lngClamped = clamp(lng, hkBounds.minLng, hkBounds.maxLng);
      const latClamped = clamp(lat, hkBounds.minLat, hkBounds.maxLat);
      const latStr = formatCoord(latClamped);
      const lngStr = formatCoord(lngClamped);
      if (active === "pickup") {
        onPlacePickup(latStr, lngStr);
      } else {
        onPlaceDropoff(latStr, lngStr);
      }
    },
    [active, onPlaceDropoff, onPlacePickup]
  );

  const pickup = useMemo(() => parseLngLat(pickupLat, pickupLng), [pickupLat, pickupLng]);
  const dropoff = useMemo(() => parseLngLat(dropoffLat, dropoffLng), [dropoffLat, dropoffLng]);

  const connectorGeoJson = useMemo(() => {
    if (!pickup || !dropoff) {
      return null;
    }
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [pickup, dropoff],
          },
        },
      ],
    };
  }, [pickup, dropoff]);

  return (
    <div className="order-map-picker" id="order-map-picker">
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <span className="chip">Map pick</span>
        <button
          className={`secondary-button ${active === "pickup" ? "is-active-toggle" : ""}`}
          onClick={() => setActive("pickup")}
          type="button"
        >
          Place pickup
        </button>
        <button
          className={`secondary-button ${active === "dropoff" ? "is-active-toggle" : ""}`}
          onClick={() => setActive("dropoff")}
          type="button"
        >
          Place dropoff
        </button>
      </div>
      <p className="panel-subtle" style={{ marginBottom: 12 }}>
        Click the map to set coordinates for the selected point. Values also sync to the latitude
        and longitude fields below (Hong Kong planner bounds).
      </p>
      <div
        className={`map-live-shell order-map-picker-shell order-map-picker-shell--${active}`}
        style={{ cursor: "crosshair" }}
      >
        <Map
          mapLib={maplibregl}
          initialViewState={initialView}
          style={{ width: "100%", height: 320 }}
          mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
          onClick={onMapClick}
        >
          <NavigationControl position="top-right" />

          {connectorGeoJson ? (
            <Source id="order-connector" type="geojson" data={connectorGeoJson}>
              <Layer
                id="order-connector-line"
                type="line"
                paint={{
                  "line-color": "#155eef",
                  "line-width": 3,
                  "line-dasharray": [2, 2],
                  "line-opacity": 0.85,
                }}
              />
            </Source>
          ) : null}

          {pickup ? (
            <Marker longitude={pickup[0]} latitude={pickup[1]} anchor="center">
              <div className="geo-marker pickup" title="Pickup" />
            </Marker>
          ) : null}
          {dropoff ? (
            <Marker longitude={dropoff[0]} latitude={dropoff[1]} anchor="center">
              <div className="geo-marker dropoff" title="Dropoff" />
            </Marker>
          ) : null}
        </Map>
      </div>
    </div>
  );
}
