import { fetchInitialAnalysisServer } from "@/lib/server-api";
import { MarketClient } from "@/components/market/MarketClient";

export const metadata = { title: "Market Analysis" };

export default async function MarketPage() {
  const initial = await fetchInitialAnalysisServer();
  return <MarketClient initialData={initial ?? undefined} />;
}