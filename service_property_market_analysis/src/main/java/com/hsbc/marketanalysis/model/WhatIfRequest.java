package com.hsbc.marketanalysis.model;

public record WhatIfRequest(Features baseline, Features modified) {
}