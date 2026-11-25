package com.hsbc.marketanalysis.config;

import java.net.http.HttpClient;

import org.slf4j.MDC;
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
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build());
        return builder
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .requestInterceptor((request, body, execution) -> {
                    String traceId = MDC.get("trace_id");
                    if (traceId != null) {
                        request.getHeaders().add("X-Trace-ID", traceId);
                    }
                    return execution.execute(request, body);
                })
                .build();
    }
}