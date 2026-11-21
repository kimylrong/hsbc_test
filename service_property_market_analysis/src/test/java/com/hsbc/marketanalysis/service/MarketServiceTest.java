package com.hsbc.marketanalysis.service;

import java.util.List;

import com.hsbc.marketanalysis.model.AnalyzeResponse;
import com.hsbc.marketanalysis.model.FilterCriteria;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MarketServiceTest {

    private MarketService marketService;

    @BeforeEach
    void setUp() throws Exception {
        DatasetService datasetService = new DatasetService("");
        datasetService.load();
        marketService = new MarketService(datasetService);
    }

    @Test
    void loadsAllRecordsAndBuildsSevenCharts() {
        AnalyzeResponse response = marketService.analyze(
                new FilterCriteria(null, null, null, null, null, null, null));

        assertThat(response.records()).hasSize(50);
        assertThat(response.charts()).hasSize(7);
        assertThat(response.charts().get(0).dimension()).isEqualTo("bedrooms");
    }

    @Test
    void bucketCountsSumToRecordCount() {
        AnalyzeResponse response = marketService.analyze(
                new FilterCriteria(null, null, null, null, null, null, null));

        long sum = response.charts().get(0).buckets().stream()
                .mapToLong(bucket -> bucket.count())
                .sum();
        assertThat(sum).isEqualTo(50);
    }

    @Test
    void filtersByDiscreteBedrooms() {
        AnalyzeResponse response = marketService.analyze(
                new FilterCriteria(List.of("3"), null, null, null, null, null, null));

        assertThat(response.records()).isNotEmpty();
        assertThat(response.records()).allMatch(record -> record.bedrooms() == 3);
    }

    @Test
    void filtersByContinuousBucket() {
        AnalyzeResponse response = marketService.analyze(
                new FilterCriteria(null, null, null, List.of("<1000"), null, null, null));

        assertThat(response.records()).isNotEmpty();
        assertThat(response.records()).allMatch(record -> record.squareFootage() < 1000);
    }

    @Test
    void emptyBucketYieldsNullAverages() {
        FilterCriteria criteria = new FilterCriteria(
                List.of("2"), List.of("1"), List.of("<1980"),
                List.of("<1000"), List.of("<5000"), List.of("<3"), List.of("<7"));
        AnalyzeResponse response = marketService.analyze(criteria);

        assertThat(response.charts())
                .flatMap(chart -> chart.buckets())
                .filteredOn(bucket -> bucket.count() == 0)
                .allSatisfy(bucket -> {
                    assertThat(bucket.avgPrice()).isNull();
                    assertThat(bucket.avgPricePerSqft()).isNull();
                });
    }

    @Test
    void cacheKeyIsOrderIndependent() {
        FilterCriteria a = new FilterCriteria(List.of("3", "2"), null, null, null, null, null, null);
        FilterCriteria b = new FilterCriteria(List.of("2", "3"), null, null, null, null, null, null);

        assertThat(a.cacheKey()).isEqualTo(b.cacheKey());
    }
}