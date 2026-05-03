import { NextResponse } from "next/server";
import { generatePythonPreview } from "@/lib/server/python-preview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const preview = await generatePythonPreview(payload);

    return NextResponse.json({
      success: true,
      data: preview,
    });
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
