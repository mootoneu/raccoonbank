package com.raccoonbank.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Application settings. The only setting for now is where the CSV files live.
 */
@ConfigurationProperties(prefix = "raccoonbank")
public record RaccoonbankProperties(String dataDirectory) {

    public RaccoonbankProperties {
        if (dataDirectory == null || dataDirectory.isBlank()) {
            dataDirectory = "./data";
        }
    }

    public Path dataPath() {
        return Path.of(dataDirectory).toAbsolutePath().normalize();
    }
}
