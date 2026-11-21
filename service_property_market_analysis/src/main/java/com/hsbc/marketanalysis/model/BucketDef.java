package com.hsbc.marketanalysis.model;

/**
 * A single bucket of a dimension. Discrete dimensions (bedrooms, bathrooms)
 * use {@code exact}; continuous dimensions use interval bounds. Bounds can be
 * inclusive or exclusive on either side so that human-friendly labels such as
 * {@code <=1000} and {@code >=2000} map to precise ranges without overlap.
 */
public record BucketDef(
        String key,
        String label,
        int order,
        Double exact,
        Double minInclusive,
        Double maxExclusive,
        Double minExclusive,
        Double maxInclusive) {

    public boolean matches(double value) {
        if (exact != null) {
            return Double.compare(value, exact) == 0;
        }
        if (minInclusive != null && value < minInclusive) {
            return false;
        }
        if (minExclusive != null && value <= minExclusive) {
            return false;
        }
        if (maxInclusive != null) {
            return value <= maxInclusive;
        }
        return maxExclusive == null || value < maxExclusive;
    }

    // Discrete exact-match bucket, e.g. bedrooms "2".
    public static BucketDef exact(String key, String label, int order, double value) {
        return new BucketDef(key, label, order, value, null, null, null, null);
    }

    // Half-open interval [min, max), e.g. "1980-1989".
    public static BucketDef range(String key, String label, int order, double minInclusive, double maxExclusive) {
        return new BucketDef(key, label, order, null, minInclusive, maxExclusive, null, null);
    }

    // Upper-open interval < max, e.g. "<1980".
    public static BucketDef lessThan(String key, String label, int order, double maxExclusive) {
        return new BucketDef(key, label, order, null, null, maxExclusive, null, null);
    }

    // Upper-closed interval <= max, e.g. "<=1000".
    public static BucketDef atMost(String key, String label, int order, double maxInclusive) {
        return new BucketDef(key, label, order, null, null, null, null, maxInclusive);
    }

    // Lower-closed interval >= min, e.g. ">=2000".
    public static BucketDef atLeast(String key, String label, int order, double minInclusive) {
        return new BucketDef(key, label, order, null, minInclusive, null, null, null);
    }

    // Open-lower, closed-upper interval (min, max], e.g. "1000-1500".
    public static BucketDef openClosed(String key, String label, int order, double minExclusive, double maxInclusive) {
        return new BucketDef(key, label, order, null, null, null, minExclusive, maxInclusive);
    }

    // Fully open interval (min, max), e.g. "1500-2000".
    public static BucketDef open(String key, String label, int order, double minExclusive, double maxExclusive) {
        return new BucketDef(key, label, order, null, null, maxExclusive, minExclusive, null);
    }
}