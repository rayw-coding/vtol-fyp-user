"use client";

import { MockOrder, OrderFormData, PreviewResult } from "@/lib/types";

const ORDER_FORM_KEY = "vtol-user-order-form";
const ORDER_PREVIEW_KEY = "vtol-user-order-preview";
const ORDER_TRACKING_KEY = "vtol-user-tracking";

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

export function saveOrderForm(form: OrderFormData) {
  writeJson(ORDER_FORM_KEY, form);
}

export function loadOrderForm() {
  return readJson<OrderFormData>(ORDER_FORM_KEY);
}

export function saveOrderPreview(preview: PreviewResult) {
  writeJson(ORDER_PREVIEW_KEY, preview);
}

export function loadOrderPreview() {
  return readJson<PreviewResult>(ORDER_PREVIEW_KEY);
}

export function saveTrackingOrder(order: MockOrder) {
  writeJson(`${ORDER_TRACKING_KEY}:${order.id}`, order);
}

export function loadTrackingOrder(orderId: string) {
  return readJson<MockOrder>(`${ORDER_TRACKING_KEY}:${orderId}`);
}
