import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Manual spans only: never export SQL, request bodies, cookies, or full URLs.
if (process.env.CAAU_OTEL_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: 'caau-api',
    traceExporter: new OTLPTraceExporter({
      url: process.env.CAAU_OTEL_ENDPOINT,
      timeoutMillis: 2000,
    }),
  });
  sdk.start();
  process.once('SIGTERM', () => {
    void sdk.shutdown().catch(() => undefined);
  });
}
