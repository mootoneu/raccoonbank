package com.cochonbank2.config;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.cochonbank2.csv.CsvUtils;

/**
 * Adds the {@code Description} column to default category files written before
 * the field existed. The migration runs once at startup, after the rolling
 * backup has copied the original file, and is a no-op for current files.
 */
@Component
public class LegacyDefaultCategoriesMigrator {

    static final List<String> LEGACY_HEADER = List.of("Id", "Category_Id", "Pattern");
    static final List<String> CURRENT_HEADER = List.of("Id", "Category_Id", "Pattern", "Description");

    private static final Logger log = LoggerFactory.getLogger(LegacyDefaultCategoriesMigrator.class);

    /**
     * @return true when a legacy file was found and rewritten
     */
    public boolean migrate(Path dataDirectory) throws IOException {
        Path file = dataDirectory.resolve("defaultcategories.csv");
        if (!Files.isRegularFile(file)) {
            return false;
        }

        List<List<String>> rows;
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            rows = CsvUtils.parse(reader);
        }
        if (rows.isEmpty() || !matchesLegacyHeader(rows.get(0))) {
            return false;
        }

        List<List<String>> migrated = new ArrayList<>(rows.size());
        migrated.add(CURRENT_HEADER);
        int count = 0;
        for (int index = 1; index < rows.size(); index++) {
            List<String> row = rows.get(index);
            if (isBlank(row)) {
                continue;
            }
            migrated.add(List.of(
                    field(row, 0),
                    field(row, 1),
                    field(row, 2),
                    ""));
            count++;
        }

        writeAtomically(file, migrated);
        log.info("Migrated {} default category rules in {} to the current CSV format",
                count, file);
        return true;
    }

    private static boolean matchesLegacyHeader(List<String> actual) {
        if (actual.size() != LEGACY_HEADER.size()) {
            return false;
        }
        for (int index = 0; index < LEGACY_HEADER.size(); index++) {
            String value = actual.get(index);
            if (value == null || !LEGACY_HEADER.get(index).equalsIgnoreCase(value.trim())) {
                return false;
            }
        }
        return true;
    }

    private static String field(List<String> row, int index) {
        return index < row.size() && row.get(index) != null ? row.get(index) : "";
    }

    private static boolean isBlank(List<String> row) {
        for (String value : row) {
            if (value != null && !value.isBlank()) {
                return false;
            }
        }
        return true;
    }

    private static void writeAtomically(Path file, List<List<String>> rows) throws IOException {
        Path temp = Files.createTempFile(file.getParent(), "defaultcategories-", ".csv.tmp");
        try {
            try (BufferedWriter writer = Files.newBufferedWriter(temp, StandardCharsets.UTF_8)) {
                for (List<String> row : rows) {
                    CsvUtils.writeRow(writer, row);
                }
            }
            try {
                Files.move(temp, file,
                        StandardCopyOption.REPLACE_EXISTING,
                        StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ex) {
            Files.deleteIfExists(temp);
            throw ex;
        }
    }
}
