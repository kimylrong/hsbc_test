package com.hsbc.marketanalysis.model;

public record HouseRecord(
        int id,
        int squareFootage,
        int bedrooms,
        double bathrooms,
        int yearBuilt,
        int lotSize,
        double distanceToCityCenter,
        double schoolRating,
        double price,
        double pricePerSqft) {
}