import { NextResponse } from "next/server";
import { generatePythonPreview } from "@/lib/server/python-preview";
import type { PreviewResult } from "@/lib/types";

export const runtime = "nodejs";

function countNoFlyPolygons(preview: PreviewResult): number {
  return preview.noFlyZonesGeoJson.features.filter(
    (f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
  ).length;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const preview = await generatePythonPreview(payload);
    const polygonCount = countNoFlyPolygons(preview);

    return NextResponse.json(
      {
        success: true,
        data: preview,
      },
      {
        headers: {
          "X-Vtol-No-Fly-Polygon-Count": String(polygonCount),
          "X-Vtol-No-Fly-Feature-Count": String(preview.noFlyZonesGeoJson.features.length),
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate preview with Python planner.";

    const status = /no valid path found/i.test(message) ? 422 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
