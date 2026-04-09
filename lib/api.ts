import { OrderFormData, PreviewResult } from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function fetchOrderPreview(form: OrderFormData): Promise<PreviewResult> {
  const payload = {
    patientName: form.patientName,
    contactNumber: form.contactNumber,
    pickupAddress: form.pickupAddress,
    dropoffAddress: form.dropoffAddress,
    pickupLat: toNumber(form.pickupLat, 22.3027),
    pickupLng: toNumber(form.pickupLng, 114.1772),
    dropoffLat: toNumber(form.dropoffLat, 22.3365),
    dropoffLng: toNumber(form.dropoffLng, 114.1751),
    medicineType: form.medicineType,
    weightKg: toNumber(form.weightKg, 1.4),
    priority: form.priority,
    notes: form.notes,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;

      throw new Error(
        errorPayload?.message ?? errorPayload?.error ?? "Preview request failed"
      );
    }

    const json = (await response.json()) as { success: boolean; data: PreviewResult };
    return json.data;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to fetch preview from backend API");
  }
}
