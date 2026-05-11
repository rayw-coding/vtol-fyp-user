import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildMockPreview } from "@/lib/mock-order";
import type {
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  OrderFormData,
  PreviewResult,
} from "@/lib/types";

const execFileAsync = promisify(execFile);

const EMPTY_FEATURE_COLLECTION: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type PythonCandidate = {
  command: string;
  argsPrefix: string[];
};

const HK_PLANNER_BOUNDS = {
  minLng: 113.75,
  maxLng: 114.5,
  minLat: 22.15,
  maxLat: 22.6,
} as const;

function toFiniteNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCoordinate(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }

  return parsed;
}

function isWithinRange(value: number, min: number, max: number) {
  return value >= min && value <= max;
}

function validatePlannerCoordinates(form: OrderFormData) {
  const pickupLat = parseCoordinate(form.pickupLat, "Pickup latitude");
  const pickupLng = parseCoordinate(form.pickupLng, "Pickup longitude");
  const dropoffLat = parseCoordinate(form.dropoffLat, "Dropoff latitude");
  const dropoffLng = parseCoordinate(form.dropoffLng, "Dropoff longitude");

  if (!isWithinRange(pickupLat, -90, 90) || !isWithinRange(dropoffLat, -90, 90)) {
    throw new Error("Latitude must be between -90 and 90.");
  }

  if (!isWithinRange(pickupLng, -180, 180) || !isWithinRange(dropoffLng, -180, 180)) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  if (
    !isWithinRange(pickupLat, HK_PLANNER_BOUNDS.minLat, HK_PLANNER_BOUNDS.maxLat) ||
    !isWithinRange(dropoffLat, HK_PLANNER_BOUNDS.minLat, HK_PLANNER_BOUNDS.maxLat) ||
    !isWithinRange(pickupLng, HK_PLANNER_BOUNDS.minLng, HK_PLANNER_BOUNDS.maxLng) ||
    !isWithinRange(dropoffLng, HK_PLANNER_BOUNDS.minLng, HK_PLANNER_BOUNDS.maxLng)
  ) {
    const swapHint =
      isWithinRange(pickupLng, HK_PLANNER_BOUNDS.minLat, HK_PLANNER_BOUNDS.maxLat) ||
      isWithinRange(dropoffLng, HK_PLANNER_BOUNDS.minLat, HK_PLANNER_BOUNDS.maxLat)
        ? " It looks like a longitude field may contain a latitude value."
        : "";

    throw new Error(
      `Coordinates must stay inside the current Hong Kong planner bounds: latitude ${HK_PLANNER_BOUNDS.minLat}-${HK_PLANNER_BOUNDS.maxLat}, longitude ${HK_PLANNER_BOUNDS.minLng}-${HK_PLANNER_BOUNDS.maxLng}.${swapHint}`
    );
  }
}

function getWorkspaceRoot() {
  return process.cwd();
}

function getPythonCandidates(workspaceRoot: string): PythonCandidate[] {
  const configured = process.env.PYTHON_BIN?.trim();
  if (configured) {
    return [{ command: configured, argsPrefix: [] }];
  }

  const localCandidates =
    process.platform === "win32"
      ? [
          path.join(workspaceRoot, ".venv", "Scripts", "python.exe"),
          path.join(workspaceRoot, "venv", "Scripts", "python.exe"),
        ]
      : [
          path.join(workspaceRoot, ".venv", "bin", "python"),
          path.join(workspaceRoot, "venv", "bin", "python"),
        ];

  const defaultCandidates: PythonCandidate[] =
    process.platform === "win32"
      ? [
          { command: "python", argsPrefix: [] },
          { command: "py", argsPrefix: ["-3"] },
          { command: "py", argsPrefix: [] },
        ]
      : [
          { command: "python3", argsPrefix: [] },
          { command: "python", argsPrefix: [] },
        ];

  return [
    ...localCandidates.map((command) => ({ command, argsPrefix: [] })),
    ...defaultCandidates,
  ];
}

async function runPythonScript(scriptPath: string, args: string[]) {
  const workspaceRoot = getWorkspaceRoot();
  const candidates = getPythonCandidates(workspaceRoot);
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(
        candidate.command,
        [...candidate.argsPrefix, scriptPath, ...args],
        {
          cwd: workspaceRoot,
          timeout: 60_000,
          maxBuffer: 1024 * 1024 * 4,
        }
      );

      return {
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        command: [candidate.command, ...candidate.argsPrefix].join(" "),
      };
    } catch (error) {
      const errorLike = error as
        | (Error & { stdout?: string; stderr?: string; code?: number | string })
        | undefined;
      const stdout = errorLike?.stdout?.trim();
      const stderr = errorLike?.stderr?.trim();
      const message =
        errorLike instanceof Error
          ? errorLike.message
          : `Unknown Python execution error for ${candidate.command}`;

      if (message.includes("ENOENT")) {
        failures.push(`${candidate.command}: not found`);
        continue;
      }

      if (/No valid path found/i.test(stdout ?? "") || /No valid path found/i.test(stderr ?? "")) {
        throw new Error(
          "No valid path found for these coordinates. Check whether the points are inside the planner area and whether current no-fly zones block every route."
        );
      }

      const details = [stdout, stderr].filter(Boolean).join(" | ");
      failures.push(
        `${candidate.command}: ${details || message}${errorLike?.code ? ` (exit ${errorLike.code})` : ""}`
      );
    }
  }

  throw new Error(`Unable to run Python script. ${failures.join(" | ")}`);
}

async function ensureGeoJsonFile(filePath: string, content: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf8");
}

async function readFeatureCollection(filePath: string): Promise<GeoJsonFeatureCollection> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as GeoJsonFeatureCollection;

  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Python planner returned an invalid GeoJSON FeatureCollection.");
  }

  return parsed;
}

async function buildNoFlyZonesGeoJson(
  fixedMapPath: string,
  aircraftMapPath: string
): Promise<PreviewResult["noFlyZonesGeoJson"]> {
  const [fixedZones, aircraftZones] = await Promise.all([
    readFeatureCollection(fixedMapPath).catch(() => EMPTY_FEATURE_COLLECTION),
    readFeatureCollection(aircraftMapPath).catch(() => EMPTY_FEATURE_COLLECTION),
  ]);

  return {
    type: "FeatureCollection",
    features: [...fixedZones.features, ...aircraftZones.features],
  };
}

function getRouteCoordinates(routeGeoJson: PreviewResult["routeGeoJson"]) {
  const pathFeature = routeGeoJson.features.find(
    (feature): feature is Extract<GeoJsonFeature, { geometry: { type: "LineString" } }> =>
      feature.geometry.type === "LineString"
  );

  return pathFeature?.geometry.coordinates ?? [];
}

function distanceBetweenPointsKm([lng1, lat1]: number[], [lng2, lat2]: number[]) {
  const latDelta = (lat2 - lat1) * 111.32;
  const lngDelta =
    (lng2 - lng1) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);

  return Math.sqrt(latDelta * latDelta + lngDelta * lngDelta);
}

function calculateRouteDistanceKm(coordinates: number[][]) {
  if (coordinates.length < 2) {
    return 0;
  }

  let distanceKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distanceKm += distanceBetweenPointsKm(coordinates[index - 1], coordinates[index]);
  }

  return Number(distanceKm.toFixed(1));
}

function calculatePrice(weightKg: number, distanceKm: number, priority: OrderFormData["priority"]) {
  const priorityMultiplier =
    priority === "critical" ? 1.35 : priority === "urgent" ? 1.18 : 1;

  return Math.round((88 + distanceKm * 24 + weightKg * 18) * priorityMultiplier);
}

function normalizeFormData(payload: Record<string, unknown>): OrderFormData {
  return {
    patientName: String(payload.patientName ?? ""),
    contactNumber: String(payload.contactNumber ?? ""),
    pickupAddress: String(payload.pickupAddress ?? ""),
    pickupLat: String(payload.pickupLat ?? ""),
    pickupLng: String(payload.pickupLng ?? ""),
    dropoffAddress: String(payload.dropoffAddress ?? ""),
    dropoffLat: String(payload.dropoffLat ?? ""),
    dropoffLng: String(payload.dropoffLng ?? ""),
    medicineType: (payload.medicineType as OrderFormData["medicineType"]) ?? "custom",
    weightKg: String(payload.weightKg ?? ""),
    priority: (payload.priority as OrderFormData["priority"]) ?? "normal",
    notes: String(payload.notes ?? ""),
  };
}

function buildPlannerSummary(aircraftDataAvailable: boolean) {
  return aircraftDataAvailable
    ? "Route generated by the Python planner using live aircraft conflict prediction."
    : "Route generated by the Python planner. Live aircraft data was unavailable, so only fixed zones were considered.";
}

function resolveFixedMapPath(workspaceRoot: string): string {
  const defaultPath = path.join(workspaceRoot, "data", "fixed-zones.empty.geojson");
  const configured = process.env.UAV_FIXED_MAP_PATH?.trim();
  if (!configured) {
    return defaultPath;
  }
  const resolved = path.isAbsolute(configured)
    ? configured
    : path.resolve(workspaceRoot, configured);
  return resolved;
}

export async function generatePythonPreview(payload: Record<string, unknown>) {
  const workspaceRoot = getWorkspaceRoot();
  const form = normalizeFormData(payload);
  validatePlannerCoordinates(form);
  const basePreview = buildMockPreview(form);

  let fixedMapPath = resolveFixedMapPath(workspaceRoot);
  const mapGenScript = path.join(workspaceRoot, "mapGEN.py");
  const mapPlanScript = path.join(workspaceRoot, "mapPlanUAV.py");

  await fs.access(mapGenScript);
  await fs.access(mapPlanScript);
  try {
    await fs.access(fixedMapPath);
  } catch {
    const fallback = path.join(workspaceRoot, "data", "fixed-zones.empty.geojson");
    if (fixedMapPath !== fallback) {
      await fs.access(fallback);
      fixedMapPath = fallback;
    } else {
      throw new Error(
        `Fixed no-fly GeoJSON not found: ${fixedMapPath}. Ensure the file exists or unset UAV_FIXED_MAP_PATH to use the bundled empty zones file.`
      );
    }
  }

  const tempDir = path.join(os.tmpdir(), "vtol-fyp-user");
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const aircraftMapPath = path.join(tempDir, `aircraft-${requestId}.geojson`);
  const routeOutputPath = path.join(tempDir, `route-${requestId}.geojson`);

  let aircraftDataAvailable = true;
  try {
    await runPythonScript(mapGenScript, [fixedMapPath, aircraftMapPath]);
  } catch {
    aircraftDataAvailable = false;
    await ensureGeoJsonFile(aircraftMapPath, EMPTY_FEATURE_COLLECTION);
  }

  const directDistanceKm = Math.max(basePreview.distanceKm, 1);
  const maxDistanceKm = Number(
    process.env.UAV_MAX_DISTANCE_KM?.trim() || Math.max(10, directDistanceKm * 3).toFixed(1)
  );

  try {
    await runPythonScript(mapPlanScript, [
      form.pickupLng,
      form.pickupLat,
      form.dropoffLng,
      form.dropoffLat,
      fixedMapPath,
      aircraftMapPath,
      routeOutputPath,
      String(maxDistanceKm),
    ]);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Python route planning failed: ${error.message}`
        : "Python route planning failed."
    );
  }

  const [routeGeoJson, noFlyZonesGeoJson] = await Promise.all([
    readFeatureCollection(routeOutputPath),
    buildNoFlyZonesGeoJson(fixedMapPath, aircraftMapPath),
  ]);
  const routeDistanceKm = calculateRouteDistanceKm(getRouteCoordinates(routeGeoJson));
  const weightKg = toFiniteNumber(form.weightKg, 1.4);
  const etaMinutes = Math.max(12, Math.round(routeDistanceKm * 4.8 + weightKg * 3));

  return {
    ...basePreview,
    canDeliver: true,
    noFlyCheckPassed: true,
    statusMessage: aircraftDataAvailable
      ? "Preview generated successfully from the Python planner."
      : "Preview generated by the Python planner without live aircraft overlays.",
    etaMinutes,
    priceHkd: calculatePrice(weightKg, routeDistanceKm || basePreview.distanceKm, form.priority),
    distanceKm: routeDistanceKm || basePreview.distanceKm,
    summary: buildPlannerSummary(aircraftDataAvailable),
    routeGeoJson,
    noFlyZonesGeoJson,
  } satisfies PreviewResult;
}
