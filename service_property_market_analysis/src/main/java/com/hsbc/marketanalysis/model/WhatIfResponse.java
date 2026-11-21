package com.hsbc.marketanalysis.model;

public record WhatIfResponse(
        double baselinePrice,
        double modifiedPrice,
        double deltaPrice,
        double deltaPercent) {
}