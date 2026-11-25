import { metrics } from '@/lib/observability/metrics';

export async function GET() {
  const body = await metrics.gather();
  return new Response(body, {
    headers: { 'Content-Type': metrics.contentType },
  });
}
