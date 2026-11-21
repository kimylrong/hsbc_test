package com.hsbc.marketanalysis.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record Features(
        @JsonProperty("square_footage") int squareFootage,
        int bedrooms,
        double bathrooms,
        @JsonProperty("year_built") int yearBuilt,
        @JsonProperty("lot_size") int lotSize,
        @JsonProperty("distance_to_city_center") double distanceToCityCenter,
        @JsonProperty("school_rating") double schoolRating) {
}