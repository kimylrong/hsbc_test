package com.hsbc.marketanalysis.model;

import java.util.List;

public record AnalyzeResponse(List<ChartData> charts, List<HouseRecord> records) {
}