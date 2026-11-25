import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { metrics } from './lib/observability/metrics';
import { logger } from './lib/observability/logger';

export const runtime = 'nodejs';

const LOGGER_SOURCE = { file: 'middleware.ts', line: 30 };

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.jpg$).*)',
  ],
};

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/metrics' && request.method === 'GET') {
    const body = await metrics.gather();
    return new NextResponse(body, {
      headers: { 'Content-Type': metrics.contentType },
    });
  }

  const existing = request.headers.get('x-trace-id');
  const traceId = existing || crypto.randomUUID().replace(/-/g, '').slice(0, 12);

  const headers = new Headers(request.headers);
  headers.set('x-trace-id', traceId);

  const start = Date.now();
  const response = await NextResponse.next({ request: { headers } });
  const durationMs = Date.now() - start;

  metrics.recordRequest(request.nextUrl.pathname, request.method, response.status, durationMs);

  logger.info(
    {
      trace_id: traceId,
      method: request.method,
      path: request.nextUrl.pathname,
      status_code: response.status,
      latency_ms: durationMs,
      'file.name': LOGGER_SOURCE.file,
      'line.number': LOGGER_SOURCE.line,
      'function.name': 'proxy',
    },
    `${request.method} ${request.nextUrl.pathname} status=${response.status} latency_ms=${durationMs}`,
  );

  response.headers.set('x-trace-id', traceId);
  return response;
}