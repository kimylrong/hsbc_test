package com.hsbc.marketanalysis.service;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.hsbc.marketanalysis.model.Features;
import com.hsbc.marketanalysis.model.WhatIfRequest;
import com.hsbc.marketanalysis.model.WhatIfResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class WhatIfService {

    private final RestClient modelRestClient;

    public WhatIfService(RestClient modelRestClient) {
        this.modelRestClient = modelRestClient;
    }

    public WhatIfResponse whatIf(WhatIfRequest request) {
        Map<String, Object> body = Map.of(
                "houses", List.of(toModelFeatures(request.baseline()), toModelFeatures(request.modified())));
        JsonNode response = modelRestClient.post()
                .uri("/predict/batch")
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        if (response == null || response.get("predictions") == null || response.get("predictions").size() < 2) {
            throw new IllegalStateException("Model returned an unexpected batch response");
        }
        double baseline = response.get("predictions").get(0).asDouble();
        double modified = response.get("predictions").get(1).asDouble();
        double delta = modified - baseline;
        double deltaPercent = baseline == 0 ? 0.0 : round2(delta / baseline * 100.0);
        return new WhatIfResponse(baseline, modified, round2(delta), deltaPercent);
    }

    private Map<String, Object> toModelFeatures(Features features) {
        return Map.of(
                "square_footage", features.squareFootage(),
                "bedrooms", features.bedrooms(),
                "bathrooms", features.bathrooms(),
                "year_built", features.yearBuilt(),
                "lot_size", features.lotSize(),
                "distance_to_city_center", features.distanceToCityCenter(),
                "school_rating", features.schoolRating());
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}