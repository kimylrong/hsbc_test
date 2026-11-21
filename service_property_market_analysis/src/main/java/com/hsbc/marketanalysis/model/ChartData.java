package com.hsbc.marketanalysis.model;

import java.util.List;

public record ChartData(String dimension, List<Bucket> buckets) {
}