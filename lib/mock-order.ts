import {
  GeoJsonFeature,
  MockOrder,
  OrderFormData,
  OrderStatus,
  PreviewResult,
  TrackingStep,
} from "@/lib/types";

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function buildMockPreview(form: OrderFormData): PreviewResult {
  const pickupLat = toNumber(form.pickupLat, 22.3027);
  const pickupLng = toNumber(form.pickupLng, 114.1772);
  const dropoffLat = toNumber(form.dropoffLat, 22.3365);
  const dropoffLng = toNumber(form.dropoffLng, 114.1751);
  const weightKg = toNumber(form.weightKg, 1.4);

  const latDeltaKm = Math.abs(dropoffLat - pickupLat) * 111;
  const lngDeltaKm = Math.abs(dropoffLng - pickupLng) * 102;
  const distanceKm = Number((latDeltaKm + lngDeltaKm).toFixed(1));

  const priorityMultiplier =
    form.priority === "critical" ? 1.35 : form.priority === "urgent" ? 1.18 : 1;

  const etaMinutes = Math.max(12, Math.round(distanceKm * 4.8 + weightKg * 3));
  const priceHkd = Math.round((88 + distanceKm * 24 + weightKg * 18) * priorityMultiplier);

  const midpointX = clamp(34 + (dropoffLng - pickupLng) * 280, 28, 76);
  const midpointY = clamp(46 - (dropoffLat - pickupLat) * 180, 24, 74);

  const riskLevel =
    form.priority === "critical" || distanceKm > 8 ? "medium" : "low";

  const routePoints = [
    {
      id: "pickup",
      label: "Pickup",
      role: "pickup" as const,
      x: 18,
      y: 68,
    },
    {
      id: "waypoint",
      label: "Waypoint",
      role: "waypoint" as const,
      x: midpointX,
      y: midpointY,
    },
    {
      id: "dropoff",
      label: "Dropoff",
      role: "dropoff" as const,
      x: 83,
      y: 28,
    },
  ];

  const blockedZones = [
    { id: "zone-a", left: 48, top: 16, width: 18, height: 18 },
    { id: "zone-b", left: 58, top: 48, width: 14, height: 14 },
  ];

  const availableDrones = [
    {
      id: "UAV-07",
      model: "VTOL Courier Mk II",
      etaMinutes: Math.max(6, etaMinutes - 8),
      batteryLevel: 82,
      payloadKg: 3.5,
      availability: "unavailable" as const,
    },
    {
      id: "UAV-04",
      model: "SkyMedic Runner",
      etaMinutes: etaMinutes + 2,
      batteryLevel: 64,
      payloadKg: 2.2,
      availability: "unavailable" as const,
    },
    {
      id: "UAV-11",
      model: "Harbor VTOL Lite",
      etaMinutes: etaMinutes + 7,
      batteryLevel: 39,
      payloadKg: 1.8,
      availability: "unavailable" as const,
    },
  ];

  const routeGeoJson: PreviewResult["routeGeoJson"] = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {
          type: "uav_planned_path",
          stroke: "#155eef",
          "stroke-width": 3,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [pickupLng, pickupLat],
            [(pickupLng + dropoffLng) / 2 + 0.0035, (pickupLat + dropoffLat) / 2 + 0.006],
            [dropoffLng, dropoffLat],
          ],
        },
      },
      {
        type: "Feature" as const,
        properties: {
          type: "start_point",
          label: "pickup",
        },
        geometry: {
          type: "Point" as const,
          coordinates: [pickupLng, pickupLat],
        },
      },
      {
        type: "Feature" as const,
        properties: {
          type: "goal_point",
          label: "dropoff",
        },
        geometry: {
          type: "Point" as const,
          coordinates: [dropoffLng, dropoffLat],
        },
      },
    ] satisfies GeoJsonFeature[],
  };

  const noFlyZonesGeoJson: PreviewResult["noFlyZonesGeoJson"] = {
    type: "FeatureCollection" as const,
    features: [],
  };

  return {
    canDeliver: false,
    noFlyCheckPassed: true,
    statusMessage:
      "No UAVs are available for assignment right now. The route below is for planning reference only.",
    etaMinutes,
    priceHkd,
    distanceKm,
    droneId: "None",
    droneModel: "—",
    batteryLevel: 82,
    riskLevel,
    summary:
      "Fleet capacity is fully booked; no aircraft can be reserved for this mission window despite a valid planned path.",
    availableDrones,
    routeGeoJson,
    noFlyZonesGeoJson,
    routePoints,
    blockedZones,
    checklist: [
      "Pickup and dropoff coordinates are inside the service area.",
      "Estimated payload stays within the current drone capacity window.",
      "Route preview avoids simulated fixed and aircraft no-fly zones.",
    ],
    timeline: [
      {
        id: "submitted",
        title: "Order submitted",
        description: "User confirms the medicine request and location details.",
      },
      {
        id: "validated",
        title: "Route and drone validation",
        description: "Backend checks drone availability, payload, and route safety.",
      },
      {
        id: "assigned",
        title: "Drone assigned",
        description: "The nearest available UAV is reserved for the mission.",
      },
      {
        id: "delivery",
        title: "Medicine delivery",
        description: "The UAV completes pickup and heads to the destination point.",
      },
    ],
  };
}

export const defaultOrderForm: OrderFormData = {
  patientName: "Alex Chan",
  contactNumber: "+852 6123 4567",
  pickupAddress: "Queen Mary Hospital Pharmacy",
  pickupLat: "22.2705",
  pickupLng: "114.1295",
  dropoffAddress: "Pok Fu Lam Residential Block A",
  dropoffLat: "22.2578",
  dropoffLng: "114.1344",
  medicineType: "antibiotics",
  weightKg: "1.6",
  priority: "urgent",
  notes: "Keep upright and avoid excessive vibration during transport.",
};

const statusLabels: Record<OrderStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  flying_to_pickup: "Flying to pickup",
  delivering: "Delivering",
  completed: "Completed",
};

/** Irregular demo times; delivering → completed ≈ 12m 17s apart. */
const trackingDemoTimestamps: Record<OrderStatus, string> = {
  pending: "2026-04-10 08:53",
  assigned: "2026-04-10 09:19",
  flying_to_pickup: "2026-04-10 10:36",
  delivering: "2026-04-10 11:42:08",
  completed: "2026-04-10 11:54:25",
};

export function buildTrackingSteps(currentStatus: OrderStatus): TrackingStep[] {
  const orderedStatuses: OrderStatus[] = [
    "pending",
    "assigned",
    "flying_to_pickup",
    "delivering",
    "completed",
  ];

  return orderedStatuses.map((status) => ({
    status,
    label: statusLabels[status],
    note:
      status === "pending"
        ? "Your order is waiting for final confirmation."
        : status === "assigned"
          ? "A drone has been reserved for this delivery."
          : status === "flying_to_pickup"
            ? "The UAV is travelling to the pharmacy pickup point."
            : status === "delivering"
              ? "The medicine is en route to the patient destination."
              : "The package has been delivered successfully.",
    timestamp: trackingDemoTimestamps[status],
    completed: orderedStatuses.indexOf(status) <= orderedStatuses.indexOf(currentStatus),
  }));
}

export function buildMockOrder(form: OrderFormData = defaultOrderForm): MockOrder {
  const preview = buildMockPreview(form);

  return {
    id: "ORD-20260410-001",
    createdAt: "2026-04-10 08:53",
    form,
    preview,
    status: "assigned",
    trackingSteps: buildTrackingSteps("assigned"),
  };
}

export const defaultMockOrder = buildMockOrder(defaultOrderForm);
