package com.raccoonbank;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class RaccoonbankApplication {

    public static void main(String[] args) {
        SpringApplication.run(RaccoonbankApplication.class, args);
    }
}
