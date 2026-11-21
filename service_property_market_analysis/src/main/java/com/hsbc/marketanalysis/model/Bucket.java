package com.hsbc.marketanalysis.model;

public record Bucket(
        String key,
        String label,
        int order,
        long count,
        Double avgPrice,
        Double avgPricePerSqft) {
}