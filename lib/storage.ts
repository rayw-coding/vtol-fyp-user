"use client";

import { MockOrder, OrderFormData, PreviewResult } from "@/lib/types";

const ORDER_FORM_KEY = "vtol-user-order-form";
const ORDER_PREVIEW_KEY = "vtol-user-order-preview";
const ORDER_TRACKING_KEY = "vtol-user-tracking";

/** localStorage is typically ~5MiB; stay under to avoid QuotaExceededError. */
const PREVIEW_JSON_SOFT_LIMIT_CHARS = 4_000_000;

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

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function trySetItem(key: string, json: string): boolean {
  try {
    window.localStorage.setItem(key, json);
    return true;
  } catch (error) {
    const isQuota =
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.code === 22);
    if (isQuota) {
      return false;
    }
    throw error;
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

function preparePreviewForStorage(preview: PreviewResult): PreviewResult {
  const full = withPreviewDefaults(preview);
  if (JSON.stringify(full).length <= PREVIEW_JSON_SOFT_LIMIT_CHARS) {
    return full;
  }
  return withPreviewDefaults(slimPreviewForStorage(preview));
}

function savePreviewPayload(preview: PreviewResult) {
  if (typeof window === "undefined") {
    return;
  }

  const prepared = preparePreviewForStorage(preview);
  let payload = JSON.stringify(prepared);

  if (trySetItem(ORDER_PREVIEW_KEY, payload)) {
    return;
  }

  const slim = withPreviewDefaults(slimPreviewForStorage(preview));
  payload = JSON.stringify(slim);
  if (trySetItem(ORDER_PREVIEW_KEY, payload)) {
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
  const preview = readJson<PreviewResult>(ORDER_PREVIEW_KEY);
  return preview ? withPreviewDefaults(preview) : null;
}

export function saveTrackingOrder(order: MockOrder) {
  const orderToSave = {
    ...order,
    preview: preparePreviewForStorage(order.preview),
  };
  const key = `${ORDER_TRACKING_KEY}:${order.id}`;
  let payload = JSON.stringify(orderToSave);
  if (trySetItem(key, payload)) {
    return;
  }
  const slimOrder = {
    ...orderToSave,
    preview: withPreviewDefaults(slimPreviewForStorage(order.preview)),
  };
  payload = JSON.stringify(slimOrder);
  if (trySetItem(key, payload)) {
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
