import type { GeoJsonFeature, OrderStatus, PreviewResult } from "@/lib/types";

export function getRouteLineCoordinates(preview: PreviewResult): [number, number][] {
  const line = preview.routeGeoJson.features.find(
    (f): f is Extract<GeoJsonFeature, { geometry: { type: "LineString" } }> =>
      f.geometry.type === "LineString"
  );
  if (line) {
    return line.geometry.coordinates as [number, number][];
  }

  const points = preview.routeGeoJson.features.filter((f) => f.geometry.type === "Point");
  const start = points.find((p) => String(p.properties.type ?? "") === "start_point");
  const goal = points.find((p) => String(p.properties.type ?? "") === "goal_point");
  if (
    start &&
    goal &&
    start.geometry.type === "Point" &&
    goal.geometry.type === "Point"
  ) {
    return [start.geometry.coordinates as [number, number], goal.geometry.coordinates as [number, number]];
  }

  return [];
}

function segmentLengthsMeters(coords: [number, number][]): number[] {
  const lens: number[] = [];
  for (let i = 1; i < coords.length; i += 1) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dy = (lat2 - lat1) * 111_320;
    const dx =
      (lng2 - lng1) * 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    lens.push(Math.hypot(dx, dy));
  }
  return lens;
}

/** t in [0,1] along total path length */
export function positionAlongRoute(coords: [number, number][], t: number): [number, number] {
  if (coords.length === 0) {
    return [114.1694, 22.3193];
  }
  if (coords.length === 1) {
    return coords[0];
  }

  const u = Math.min(1, Math.max(0, t));
  const lens = segmentLengthsMeters(coords);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let remaining = total * u;

  for (let i = 0; i < lens.length; i += 1) {
    const segLen = lens[i];
    if (remaining <= segLen || i === lens.length - 1) {
      const segT = segLen > 0 ? Math.min(1, remaining / segLen) : 1;
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[i + 1];
      return [lng1 + (lng2 - lng1) * segT, lat1 + (lat2 - lat1) * segT];
    }
    remaining -= segLen;
  }

  return coords[coords.length - 1];
}

/**
 * Timeline phases for ~60s demo (starts from `assigned` as when user lands on tracking).
 * Movement uses full [0,1]; status advances in bands.
 */
export function orderStatusForDemoProgress(t: number): OrderStatus {
  const u = Math.min(1, Math.max(0, t));
  if (u < 0.02) {
    return "assigned";
  }
  if (u < 0.34) {
    return "flying_to_pickup";
  }
  if (u < 0.9) {
    return "delivering";
  }
  return "completed";
}

export function formatOrderStatus(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    pending: "Pending",
    assigned: "Assigned",
    flying_to_pickup: "Flying to pickup",
    delivering: "Delivering",
    completed: "Completed",
  };
  return labels[status];
}
