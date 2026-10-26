package com.cochonbank2.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Application settings. The only setting for now is where the CSV files live.
 */
@ConfigurationProperties(prefix = "cochonbank")
public record CochonbankProperties(String dataDirectory) {

    public CochonbankProperties {
        if (dataDirectory == null || dataDirectory.isBlank()) {
            dataDirectory = "./data";
        }
    }

    public Path dataPath() {
        return Path.of(dataDirectory).toAbsolutePath().normalize();
    }
}
