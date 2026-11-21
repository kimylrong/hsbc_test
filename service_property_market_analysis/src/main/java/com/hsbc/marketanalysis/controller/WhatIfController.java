package com.hsbc.marketanalysis.controller;

import com.hsbc.marketanalysis.model.WhatIfRequest;
import com.hsbc.marketanalysis.model.WhatIfResponse;
import com.hsbc.marketanalysis.service.WhatIfService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/market")
public class WhatIfController {

    private final WhatIfService whatIfService;

    public WhatIfController(WhatIfService whatIfService) {
        this.whatIfService = whatIfService;
    }

    @PostMapping("/what-if")
    public WhatIfResponse whatIf(@RequestBody WhatIfRequest request) {
        return whatIfService.whatIf(request);
    }
}