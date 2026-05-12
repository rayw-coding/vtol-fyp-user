"use client";

import { MockOrder, OrderFormData, PreviewResult } from "@/lib/types";

const ORDER_FORM_KEY = "vtol-user-order-form";
const ORDER_PREVIEW_KEY = "vtol-user-order-preview";
const ORDER_TRACKING_KEY = "vtol-user-tracking";

/** localStorage quota is small and shared with other keys; keep payload tiny. */
const PREVIEW_JSON_SOFT_LIMIT_CHARS = 450_000;

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readJsonFromSession<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function tryLocalStorageSetItem(key: string, json: string): boolean {
  try {
    window.localStorage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

function trySessionStorageSetItem(key: string, json: string): boolean {
  try {
    window.sessionStorage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

/** Drop heavy no-fly overlays; route + pricing UI still work. */
function slimPreviewForStorage(preview: PreviewResult): PreviewResult {
  return {
    ...preview,
    noFlyZonesGeoJson: {
      type: "FeatureCollection",
      features: [],
    },
  };
}

/** Route-only GeoJSON: keep line + markers; LineString first so slim cache still draws a path. */
function trimRouteGeoJsonForStorage(preview: PreviewResult): PreviewResult["routeGeoJson"] {
  const fc = preview.routeGeoJson;
  const maxFeatures = 12;
  const lineStrings = fc.features.filter((f) => f.geometry.type === "LineString");
  const rest = fc.features.filter((f) => f.geometry.type !== "LineString");
  const features = [...lineStrings, ...rest].slice(0, maxFeatures);
  return { type: "FeatureCollection", features };
}

function minimalPreviewForStorage(preview: PreviewResult): PreviewResult {
  const base = withPreviewDefaults(slimPreviewForStorage(preview));
  const selected = base.availableDrones.find((d) => d.id === base.droneId) ?? base.availableDrones[0];
  const drones = selected
    ? base.availableDrones.filter((d) => d.id === selected.id).slice(0, 1)
    : base.availableDrones.slice(0, 1);

  return {
    ...base,
    routeGeoJson: trimRouteGeoJsonForStorage(base),
    availableDrones: drones.length > 0 ? drones : base.availableDrones.slice(0, 1),
    timeline: base.timeline.slice(0, 24),
    checklist: base.checklist.slice(0, 24),
    blockedZones: base.blockedZones.slice(0, 24),
    summary: base.summary.slice(0, 2000),
    statusMessage: base.statusMessage.slice(0, 2000),
  };
}

function preparePreviewForStorage(preview: PreviewResult): PreviewResult {
  let candidate = withPreviewDefaults(slimPreviewForStorage(preview));
  if (JSON.stringify(candidate).length > PREVIEW_JSON_SOFT_LIMIT_CHARS) {
    candidate = minimalPreviewForStorage(preview);
  }
  return candidate;
}

function savePreviewPayload(preview: PreviewResult) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(ORDER_PREVIEW_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.removeItem(ORDER_PREVIEW_KEY);
  } catch {
    /* ignore */
  }

  let prepared = preparePreviewForStorage(preview);
  let payload = JSON.stringify(prepared);

  if (payload.length > PREVIEW_JSON_SOFT_LIMIT_CHARS) {
    prepared = minimalPreviewForStorage(preview);
    payload = JSON.stringify(prepared);
  }

  if (tryLocalStorageSetItem(ORDER_PREVIEW_KEY, payload)) {
    return;
  }
  if (trySessionStorageSetItem(ORDER_PREVIEW_KEY, payload)) {
    return;
  }

  const tiny = minimalPreviewForStorage(preview);
  const tinyPayload = JSON.stringify(tiny);
  if (tryLocalStorageSetItem(ORDER_PREVIEW_KEY, tinyPayload)) {
    return;
  }
  if (trySessionStorageSetItem(ORDER_PREVIEW_KEY, tinyPayload)) {
    return;
  }

  throw new Error(
    "Browser storage is full. Clear site data for this site or use another browser profile, then try again."
  );
}

function withPreviewDefaults(preview: PreviewResult): PreviewResult {
  return {
    ...preview,
    noFlyZonesGeoJson: preview.noFlyZonesGeoJson ?? {
      type: "FeatureCollection",
      features: [],
    },
  };
}

export function saveOrderForm(form: OrderFormData) {
  writeJson(ORDER_FORM_KEY, form);
}

export function loadOrderForm() {
  return readJson<OrderFormData>(ORDER_FORM_KEY);
}

export function saveOrderPreview(preview: PreviewResult) {
  savePreviewPayload(preview);
}

export function loadOrderPreview() {
  const fromLocal = readJson<PreviewResult>(ORDER_PREVIEW_KEY);
  if (fromLocal) {
    return withPreviewDefaults(fromLocal);
  }
  const fromSession = readJsonFromSession<PreviewResult>(ORDER_PREVIEW_KEY);
  return fromSession ? withPreviewDefaults(fromSession) : null;
}

export function saveTrackingOrder(order: MockOrder) {
  const key = `${ORDER_TRACKING_KEY}:${order.id}`;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }

  let orderToSave = {
    ...order,
    preview: preparePreviewForStorage(order.preview),
  };
  let payload = JSON.stringify(orderToSave);
  if (payload.length > PREVIEW_JSON_SOFT_LIMIT_CHARS) {
    orderToSave = {
      ...order,
      preview: minimalPreviewForStorage(order.preview),
    };
    payload = JSON.stringify(orderToSave);
  }
  if (tryLocalStorageSetItem(key, payload)) {
    return;
  }
  const slimOrder = {
    ...order,
    preview: minimalPreviewForStorage(order.preview),
  };
  payload = JSON.stringify(slimOrder);
  if (tryLocalStorageSetItem(key, payload)) {
    return;
  }
  throw new Error(
    "Browser storage is full. Clear site data for this site or use another browser profile, then try again."
  );
}

export function loadTrackingOrder(orderId: string) {
  const order = readJson<MockOrder>(`${ORDER_TRACKING_KEY}:${orderId}`);
  if (!order) {
    return null;
  }

  return {
    ...order,
    preview: withPreviewDefaults(order.preview),
  };
}
