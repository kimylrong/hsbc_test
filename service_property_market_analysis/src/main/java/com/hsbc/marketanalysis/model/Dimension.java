package com.hsbc.marketanalysis.model;

import java.util.List;
import java.util.function.ToDoubleFunction;

public enum Dimension {

    BEDROOMS("bedrooms", HouseRecord::bedrooms, List.of(
            BucketDef.exact("2", "2", 1, 2.0),
            BucketDef.exact("3", "3", 2, 3.0),
            BucketDef.exact("4", "4", 3, 4.0))),

    BATHROOMS("bathrooms", HouseRecord::bathrooms, List.of(
            BucketDef.exact("1", "1", 1, 1.0),
            BucketDef.exact("1.5", "1.5", 2, 1.5),
            BucketDef.exact("2", "2", 3, 2.0),
            BucketDef.exact("2.5", "2.5", 4, 2.5),
            BucketDef.exact("3", "3", 5, 3.0))),

    YEAR_BUILT("year_built", HouseRecord::yearBuilt, List.of(
            BucketDef.lessThan("<1980", "<1980", 1, 1980.0),
            BucketDef.range("1980-1989", "1980-1989", 2, 1980.0, 1990.0),
            BucketDef.range("1990-1999", "1990-1999", 3, 1990.0, 2000.0),
            BucketDef.range("2000-2009", "2000-2009", 4, 2000.0, 2010.0),
            BucketDef.atLeast(">=2010", ">=2010", 5, 2010.0))),

    SQUARE_FOOTAGE("square_footage", HouseRecord::squareFootage, List.of(
            BucketDef.lessThan("<1000", "<1000", 1, 1000.0),
            BucketDef.range("1000-1500", "1000-1500", 2, 1000.0, 1500.0),
            BucketDef.range("1500-2000", "1500-2000", 3, 1500.0, 2000.0),
            BucketDef.atLeast(">=2000", ">=2000", 4, 2000.0))),

    LOT_SIZE("lot_size", HouseRecord::lotSize, List.of(
            BucketDef.lessThan("<5000", "<5000", 1, 5000.0),
            BucketDef.range("5000-7000", "5000-7000", 2, 5000.0, 7000.0),
            BucketDef.range("7000-9000", "7000-9000", 3, 7000.0, 9000.0),
            BucketDef.atLeast(">=9000", ">=9000", 4, 9000.0))),

    DISTANCE_TO_CITY_CENTER("distance_to_city_center", HouseRecord::distanceToCityCenter, List.of(
            BucketDef.lessThan("<3", "<3", 1, 3.0),
            BucketDef.range("3-5", "3-5", 2, 3.0, 5.0),
            BucketDef.range("5-7", "5-7", 3, 5.0, 7.0),
            BucketDef.atLeast(">=7", ">=7", 4, 7.0))),

    SCHOOL_RATING("school_rating", HouseRecord::schoolRating, List.of(
            BucketDef.lessThan("<7", "<7", 1, 7.0),
            BucketDef.range("7-8", "7-8", 2, 7.0, 8.0),
            BucketDef.range("8-9", "8-9", 3, 8.0, 9.0),
            BucketDef.atLeast(">=9", ">=9", 4, 9.0)));

    private final String dimensionName;
    private final ToDoubleFunction<HouseRecord> extractor;
    private final List<BucketDef> buckets;

    Dimension(String dimensionName, ToDoubleFunction<HouseRecord> extractor, List<BucketDef> buckets) {
        this.dimensionName = dimensionName;
        this.extractor = extractor;
        this.buckets = buckets;
    }

    public String dimensionName() {
        return dimensionName;
    }

    public List<BucketDef> buckets() {
        return buckets;
    }

    public double value(HouseRecord record) {
        return extractor.applyAsDouble(record);
    }

    public String bucketKeyFor(double value) {
        for (BucketDef bucket : buckets) {
            if (bucket.matches(value)) {
                return bucket.key();
            }
        }
        return null;
    }

    public String bucketKeyFor(HouseRecord record) {
        return bucketKeyFor(value(record));
    }
}