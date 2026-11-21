package com.hsbc.marketanalysis.service;

import java.util.ArrayList;
import java.util.List;

import com.hsbc.marketanalysis.model.AnalyzeResponse;
import com.hsbc.marketanalysis.model.Bucket;
import com.hsbc.marketanalysis.model.BucketDef;
import com.hsbc.marketanalysis.model.ChartData;
import com.hsbc.marketanalysis.model.Dimension;
import com.hsbc.marketanalysis.model.FilterCriteria;
import com.hsbc.marketanalysis.model.HouseRecord;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class MarketService {

    private final DatasetService datasetService;

    public MarketService(DatasetService datasetService) {
        this.datasetService = datasetService;
    }

    @Cacheable(cacheNames = "analyze", key = "#criteria.cacheKey()")
    public AnalyzeResponse analyze(FilterCriteria criteria) {
        List<HouseRecord> filtered = filter(criteria);
        List<ChartData> charts = new ArrayList<>();
        for (Dimension dimension : Dimension.values()) {
            charts.add(buildChart(dimension, filtered));
        }
        return new AnalyzeResponse(charts, filtered);
    }

    private List<HouseRecord> filter(FilterCriteria criteria) {
        return datasetService.records().stream()
                .filter(record -> passes(criteria.bedrooms(), Dimension.BEDROOMS, record))
                .filter(record -> passes(criteria.bathrooms(), Dimension.BATHROOMS, record))
                .filter(record -> passes(criteria.yearBuilt(), Dimension.YEAR_BUILT, record))
                .filter(record -> passes(criteria.squareFootage(), Dimension.SQUARE_FOOTAGE, record))
                .filter(record -> passes(criteria.lotSize(), Dimension.LOT_SIZE, record))
                .filter(record -> passes(criteria.distanceToCityCenter(), Dimension.DISTANCE_TO_CITY_CENTER, record))
                .filter(record -> passes(criteria.schoolRating(), Dimension.SCHOOL_RATING, record))
                .toList();
    }

    private boolean passes(List<String> selected, Dimension dimension, HouseRecord record) {
        if (selected == null || selected.isEmpty()) {
            return true;
        }
        String key = dimension.bucketKeyFor(record);
        return key != null && selected.contains(key);
    }

    private ChartData buildChart(Dimension dimension, List<HouseRecord> filtered) {
        List<Bucket> buckets = new ArrayList<>();
        for (BucketDef def : dimension.buckets()) {
            List<HouseRecord> inBucket = filtered.stream()
                    .filter(record -> def.matches(dimension.value(record)))
                    .toList();
            buckets.add(new Bucket(
                    def.key(),
                    def.label(),
                    def.order(),
                    inBucket.size(),
                    avgPrice(inBucket),
                    avgPricePerSqft(inBucket)));
        }
        return new ChartData(dimension.dimensionName(), buckets);
    }

    private Double avgPrice(List<HouseRecord> records) {
        if (records.isEmpty()) {
            return null;
        }
        double sum = records.stream().mapToDouble(HouseRecord::price).sum();
        return round2(sum / records.size());
    }

    private Double avgPricePerSqft(List<HouseRecord> records) {
        if (records.isEmpty()) {
            return null;
        }
        double sum = records.stream().mapToDouble(HouseRecord::pricePerSqft).sum();
        return round2(sum / records.size());
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}