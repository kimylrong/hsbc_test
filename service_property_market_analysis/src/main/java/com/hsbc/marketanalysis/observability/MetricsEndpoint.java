package com.hsbc.marketanalysis.observability;

import java.io.IOException;
import java.io.StringWriter;
import java.io.Writer;

import io.prometheus.client.CollectorRegistry;
import io.prometheus.client.exporter.common.TextFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MetricsEndpoint {

    private final CollectorRegistry registry = CollectorRegistry.defaultRegistry;

    @GetMapping(value = "/metrics", produces = TextFormat.CONTENT_TYPE_004)
    public ResponseEntity<String> metrics() throws IOException {
        Writer writer = new StringWriter();
        TextFormat.write004(writer, registry.metricFamilySamples());
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(TextFormat.CONTENT_TYPE_004)).body(writer.toString());
    }
}