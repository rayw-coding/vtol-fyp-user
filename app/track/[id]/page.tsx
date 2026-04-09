import { TrackingPage } from "@/components/user-flow";

export default async function TrackingRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <TrackingPage orderId={id} />;
}
