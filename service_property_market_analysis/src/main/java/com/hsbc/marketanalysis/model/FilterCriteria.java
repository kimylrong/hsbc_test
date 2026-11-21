package com.hsbc.marketanalysis.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public record FilterCriteria(
        List<String> bedrooms,
        List<String> bathrooms,
        @JsonProperty("year_built") List<String> yearBuilt,
        @JsonProperty("square_footage") List<String> squareFootage,
        @JsonProperty("lot_size") List<String> lotSize,
        @JsonProperty("distance_to_city_center") List<String> distanceToCityCenter,
        @JsonProperty("school_rating") List<String> schoolRating) {

    public FilterCriteria {
        bedrooms = emptyIfNull(bedrooms);
        bathrooms = emptyIfNull(bathrooms);
        yearBuilt = emptyIfNull(yearBuilt);
        squareFootage = emptyIfNull(squareFootage);
        lotSize = emptyIfNull(lotSize);
        distanceToCityCenter = emptyIfNull(distanceToCityCenter);
        schoolRating = emptyIfNull(schoolRating);
    }

    public String cacheKey() {
        return String.join("|",
                part("bedrooms", bedrooms),
                part("bathrooms", bathrooms),
                part("yearBuilt", yearBuilt),
                part("squareFootage", squareFootage),
                part("lotSize", lotSize),
                part("distanceToCityCenter", distanceToCityCenter),
                part("schoolRating", schoolRating));
    }

    private static List<String> emptyIfNull(List<String> values) {
        return values == null ? List.of() : values;
    }

    private static String part(String name, List<String> values) {
        List<String> sorted = values.stream().sorted().toList();
        return name + "=" + String.join(",", sorted);
    }
}