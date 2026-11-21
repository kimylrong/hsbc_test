import { fetchHistoryServer } from "@/lib/server-api";
import { EstimatorClient } from "@/components/estimator/EstimatorClient";

export const metadata = { title: "Property Value Estimator" };

export default async function EstimatorPage() {
  const initialHistory = await fetchHistoryServer();
  return <EstimatorClient initialHistory={initialHistory} />;
}