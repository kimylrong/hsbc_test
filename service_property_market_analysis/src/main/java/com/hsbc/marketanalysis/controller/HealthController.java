package com.hsbc.marketanalysis.controller;

import java.util.Map;

import com.hsbc.marketanalysis.service.DatasetService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final DatasetService datasetService;

    public HealthController(DatasetService datasetService) {
        this.datasetService = datasetService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, String>> ready() {
        if (datasetService.records().isEmpty()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("status", "not_ready"));
        }
        return ResponseEntity.ok(Map.of("status", "ready"));
    }
}