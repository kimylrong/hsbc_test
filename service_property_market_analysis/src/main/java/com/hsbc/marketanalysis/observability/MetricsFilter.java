package com.hsbc.marketanalysis.observability;

import java.io.IOException;

import io.prometheus.client.CollectorRegistry;
import io.prometheus.client.Counter;
import io.prometheus.client.Histogram;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 200)
public class MetricsFilter extends OncePerRequestFilter {

    private static final String SERVICE = "property-market-analysis";
    private static final String[] LABELS = {"service", "endpoint", "method", "status_code"};
    private static final double[] BUCKETS = {0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, 30.0, 60.0};

    private final Counter requests;
    private final Histogram latency;

    public MetricsFilter() {
        this.requests = Counter.build()
                .name("http_requests_total")
                .help("Total HTTP requests")
                .labelNames(LABELS)
                .register();
        this.latency = Histogram.build()
                .name("http_request_duration_seconds")
                .help("HTTP request latency")
                .labelNames(LABELS)
                .buckets(BUCKETS)
                .register();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String endpoint = request.getServletPath();
        if (endpoint == null || endpoint.isBlank()) {
            endpoint = request.getRequestURI();
        }
        if ("/metrics".equals(endpoint)) {
            chain.doFilter(request, response);
            return;
        }

        long startNs = System.nanoTime();
        int status = 500;
        try {
            chain.doFilter(request, response);
            status = response.getStatus();
        } catch (IOException | ServletException | RuntimeException ex) {
            status = 500;
            throw ex;
        } finally {
            double seconds = (System.nanoTime() - startNs) / 1_000_000_000.0;
            String statusStr = String.valueOf(status);
            requests.labels(SERVICE, endpoint, request.getMethod(), statusStr).inc();
            latency.labels(SERVICE, endpoint, request.getMethod(), statusStr).observe(seconds);
        }
    }
}