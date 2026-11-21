package com.hsbc.marketanalysis.controller;

import com.hsbc.marketanalysis.model.AnalyzeResponse;
import com.hsbc.marketanalysis.model.FilterCriteria;
import com.hsbc.marketanalysis.service.MarketService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/market")
public class AnalyzeController {

    private final MarketService marketService;

    public AnalyzeController(MarketService marketService) {
        this.marketService = marketService;
    }

    @PostMapping("/analyze")
    public AnalyzeResponse analyze(@RequestBody FilterCriteria criteria) {
        return marketService.analyze(criteria);
    }
}