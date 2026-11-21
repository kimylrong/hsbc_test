package com.hsbc.marketanalysis.config;

import java.net.http.HttpClient;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class AppConfig {

    @Bean
    public RestClient modelRestClient(
            RestClient.Builder builder,
            @Value("${model.api.url:http://localhost:8000}") String baseUrl) {
        // Task 1 (uvicorn) does not support h2c upgrade; force HTTP/1.1.
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build());
        return builder.baseUrl(baseUrl).requestFactory(requestFactory).build();
    }
}