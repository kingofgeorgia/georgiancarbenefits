import { SharedDealView } from "@/components/deals/SharedDealView";

export default async function SharedDealPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <SharedDealView publicId={publicId} />;
}
