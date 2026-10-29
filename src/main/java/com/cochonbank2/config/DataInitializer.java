package com.cochonbank2.config;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Creates the data directory on first launch, copies the bundled seed files
 * (categories and default category rules), stores a backup of the current data
 * files and migrates ledgers written by the first app version. Existing user
 * data is never overwritten.
 */
@Component
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);
    private static final String[] FILES = {
            "transactions.csv", "categories.csv", "defaultcategories.csv"
    };

    private final CochonbankProperties properties;
    private final DataBackupService backupService;
    private final LegacyTransactionsMigrator legacyMigrator;
    private final LegacyDefaultCategoriesMigrator legacyDefaultCategoriesMigrator;
    private final LegacyCategoryGroupsMigrator legacyCategoryGroupsMigrator;

    public DataInitializer(
            CochonbankProperties properties,
            DataBackupService backupService,
            LegacyTransactionsMigrator legacyMigrator,
            LegacyDefaultCategoriesMigrator legacyDefaultCategoriesMigrator,
            LegacyCategoryGroupsMigrator legacyCategoryGroupsMigrator) {
        this.properties = properties;
        this.backupService = backupService;
        this.legacyMigrator = legacyMigrator;
        this.legacyDefaultCategoriesMigrator = legacyDefaultCategoriesMigrator;
        this.legacyCategoryGroupsMigrator = legacyCategoryGroupsMigrator;
    }

    @Override
    public void run(ApplicationArguments args) throws IOException {
        Path directory = properties.dataPath();
        Files.createDirectories(directory);
        backupService.backupOnStartup();
        legacyMigrator.migrate(directory);
        legacyDefaultCategoriesMigrator.migrate(directory);
        legacyCategoryGroupsMigrator.migrate(directory);

        for (String fileName : FILES) {
            Path target = directory.resolve(fileName);
            if (Files.exists(target)) {
                continue;
            }
            ClassPathResource seed = new ClassPathResource("seed/" + fileName);
            if (!seed.exists()) {
                log.warn("No seed resource for {}, the file will be created empty", fileName);
                continue;
            }
            try (InputStream input = seed.getInputStream()) {
                Files.copy(input, target);
            }
            log.info("Created data file {}", target);
        }
        log.info("CochonBank2 data directory: {}", directory);
    }
}
