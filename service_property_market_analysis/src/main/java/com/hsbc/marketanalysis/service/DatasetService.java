package com.hsbc.marketanalysis.service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import com.hsbc.marketanalysis.model.HouseRecord;
import jakarta.annotation.PostConstruct;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

@Service
public class DatasetService {

    private final Resource dataset;
    private List<HouseRecord> records = List.of();

    public DatasetService(@Value("${dataset.path:}") String datasetPath) {
        if (datasetPath == null || datasetPath.isBlank()) {
            this.dataset = new ClassPathResource("house_price_dataset.csv");
        } else {
            this.dataset = new FileSystemResource(datasetPath);
        }
    }

    @PostConstruct
    void load() throws IOException {
        records = parse(dataset);
    }

    public List<HouseRecord> records() {
        return records;
    }

    private List<HouseRecord> parse(Resource resource) throws IOException {
        List<HouseRecord> result = new ArrayList<>();
        try (InputStream in = resource.getInputStream();
             BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            reader.mark(1);
            if (reader.read() != '\uFEFF') {
                reader.reset();
            }
            try (CSVParser parser = CSVFormat.DEFAULT.builder()
                    .setHeader()
                    .setSkipHeaderRecord(true)
                    .setTrim(true)
                    .build()
                    .parse(reader)) {
                for (CSVRecord row : parser) {
                    int id = Integer.parseInt(row.get(0));
                    int squareFootage = Integer.parseInt(row.get(1));
                    int bedrooms = Integer.parseInt(row.get(2));
                    double bathrooms = Double.parseDouble(row.get(3));
                    int yearBuilt = Integer.parseInt(row.get(4));
                    int lotSize = Integer.parseInt(row.get(5));
                    double distanceToCityCenter = Double.parseDouble(row.get(6));
                    double schoolRating = Double.parseDouble(row.get(7));
                    double price = Double.parseDouble(row.get(8));
                    double pricePerSqft = round2(price / squareFootage);
                    result.add(new HouseRecord(id, squareFootage, bedrooms, bathrooms, yearBuilt,
                            lotSize, distanceToCityCenter, schoolRating, price, pricePerSqft));
                }
            }
        }
        return List.copyOf(result);
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}