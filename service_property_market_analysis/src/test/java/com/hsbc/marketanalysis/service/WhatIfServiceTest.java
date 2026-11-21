package com.hsbc.marketanalysis.service;

import com.hsbc.marketanalysis.model.Features;
import com.hsbc.marketanalysis.model.WhatIfRequest;
import com.hsbc.marketanalysis.model.WhatIfResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.response.MockRestResponseCreators;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

class WhatIfServiceTest {

    @Test
    void computesDeltaFromBatchPredictions() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(request -> {
            assertThat(request.getMethod()).isEqualTo(HttpMethod.POST);
            assertThat(request.getURI().getPath()).isEqualTo("/predict/batch");
        }).andRespond(MockRestResponseCreators.withSuccess(
                "{\"predictions\":[200000.0, 220000.0]}", MediaType.APPLICATION_JSON));

        WhatIfService service = new WhatIfService(builder.build());
        Features baseline = new Features(2000, 3, 2.0, 2000, 8000, 3.5, 8.0);
        Features modified = new Features(2200, 4, 2.5, 2005, 8000, 3.5, 8.5);

        WhatIfResponse response = service.whatIf(new WhatIfRequest(baseline, modified));

        assertThat(response.baselinePrice()).isEqualTo(200000.0);
        assertThat(response.modifiedPrice()).isEqualTo(220000.0);
        assertThat(response.deltaPrice()).isEqualTo(20000.0);
        assertThat(response.deltaPercent()).isEqualTo(10.0);
        server.verify();
    }
}