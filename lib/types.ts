export type PriorityLevel = "normal" | "urgent" | "critical";
export type OrderStatus =
  | "pending"
  | "assigned"
  | "flying_to_pickup"
  | "delivering"
  | "completed";

export type MedicineType =
  | "pain-relief"
  | "antibiotics"
  | "insulin"
  | "cardiac"
  | "custom";

export type OrderFormData = {
  patientName: string;
  contactNumber: string;
  pickupAddress: string;
  pickupLat: string;
  pickupLng: string;
  dropoffAddress: string;
  dropoffLat: string;
  dropoffLng: string;
  medicineType: MedicineType;
  weightKg: string;
  priority: PriorityLevel;
  notes: string;
};

export type DroneOption = {
  id: string;
  model: string;
  etaMinutes: number;
  batteryLevel: number;
  payloadKg: number;
  availability: "ready" | "charging" | "maintenance" | "unavailable";
};

export type RoutePoint = {
  id: string;
  label: string;
  role: "pickup" | "waypoint" | "dropoff";
  x: number;
  y: number;
};

export type GeoJsonProperties = Record<string, string | number | boolean>;

export type GeoJsonFeature =
  | {
      type: "Feature";
      properties: GeoJsonProperties;
      geometry: {
        type: "LineString";
        coordinates: number[][];
      };
    }
  | {
      type: "Feature";
      properties: GeoJsonProperties;
      geometry: {
        type: "Point";
        coordinates: number[];
      };
    }
  | {
      type: "Feature";
      properties: GeoJsonProperties;
      geometry: {
        type: "Polygon";
        coordinates: number[][][];
      };
    }
  | {
      type: "Feature";
      properties: GeoJsonProperties;
      geometry: {
        type: "MultiPolygon";
        coordinates: number[][][][];
      };
    };

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type PreviewResult = {
  canDeliver: boolean;
  noFlyCheckPassed: boolean;
  statusMessage: string;
  etaMinutes: number;
  priceHkd: number;
  distanceKm: number;
  droneId: string;
  droneModel: string;
  batteryLevel: number;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  availableDrones: DroneOption[];
  routeGeoJson: GeoJsonFeatureCollection;
  noFlyZonesGeoJson: GeoJsonFeatureCollection;
  routePoints: RoutePoint[];
  blockedZones: Array<{
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  checklist: string[];
  timeline: Array<{
    id: string;
    title: string;
    description: string;
  }>;
};

export type TrackingStep = {
  status: OrderStatus;
  label: string;
  note: string;
  timestamp: string;
  completed: boolean;
};

export type MockOrder = {
  id: string;
  createdAt: string;
  form: OrderFormData;
  preview: PreviewResult;
  status: OrderStatus;
  trackingSteps: TrackingStep[];
};
