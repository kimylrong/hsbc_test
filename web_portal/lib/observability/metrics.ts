import client from 'prom-client';

const SERVICE_NAME = 'web-portal';
const BUCKETS: number[] = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, 30.0, 60.0];

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['service', 'endpoint', 'method', 'status_code'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['service', 'endpoint', 'method', 'status_code'],
  buckets: BUCKETS,
});

export const metrics = {
  recordRequest(endpoint: string, method: string, statusCode: number, durationMs: number) {
    const labels = {
      service: SERVICE_NAME,
      endpoint,
      method,
      status_code: String(statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationMs / 1000);
  },

  async gather(): Promise<string> {
    return client.register.metrics();
  },
  contentType: client.register.contentType,
};
