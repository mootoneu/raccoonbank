package com.raccoonbank.config;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.raccoonbank.csv.CsvException;
import com.raccoonbank.csv.CsvUtils;

/**
 * Migrates the pre-grouping category model. Older files only had
 * {@code Id,Name,Color}; categories were grouped implicitly by the tens of the
 * id (40 and 43 both belonged to group 4). This migration makes the grouping
 * explicit and multiplies every category id by ten:
 *
 * <pre>
 * 43,Ordinateur,#32bdbc
 *   -> 430,4,30,Loisir,Ordinateur,#32bdbc
 * </pre>
 *
 * <p>Transactions and default category rules reference category ids, so their
 * {@code Category_Id} column is multiplied by ten in the same migration. It
 * runs once at startup, after the rolling backup and the column migrations. A
 * file already in the current format is left untouched.</p>
 */
@Component
public class LegacyCategoryGroupsMigrator {

    static final List<String> LEGACY_HEADER = List.of("Id", "Name", "Color");
    static final List<String> CURRENT_HEADER = List.of(
            "Id", "GroupId", "SubId", "GroupName", "Name", "Color");

    private static final Logger log = LoggerFactory.getLogger(LegacyCategoryGroupsMigrator.class);

    /**
     * @return true when a legacy category file was found and rewritten
     */
    public boolean migrate(Path dataDirectory) throws IOException {
        Path file = dataDirectory.resolve("categories.csv");
        if (!Files.isRegularFile(file)) {
            return false;
        }

        List<List<String>> rows = read(file);
        if (rows.isEmpty() || !matchesLegacyHeader(rows.get(0))) {
            return false;
        }

        List<LegacyCategory> categories = new ArrayList<>();
        Map<Long, LegacyCategory> byId = new LinkedHashMap<>();
        for (int index = 1; index < rows.size(); index++) {
            List<String> row = rows.get(index);
            if (isBlank(row)) {
                continue;
            }
            List<String> padded = pad(row);
            long id = parseId(padded.get(0), "categories.csv record " + index);
            LegacyCategory category = new LegacyCategory(id, padded.get(1), padded.get(2));
            if (byId.putIfAbsent(id, category) != null) {
                throw new CsvException("categories.csv: duplicate category id " + id);
            }
            categories.add(category);
        }

        Map<Long, Long> ids = new HashMap<>();
        List<List<String>> migrated = new ArrayList<>(rows.size());
        migrated.add(CURRENT_HEADER);
        for (LegacyCategory category : categories) {
            long groupId = category.id / 10;
            long subId = (category.id % 10) * 10;
            LegacyCategory root = byId.get(groupId * 10);
            String groupName = root == null ? category.name : root.name;
            long newId = category.id * 10;
            ids.put(category.id, newId);
            migrated.add(List.of(
                    Long.toString(newId),
                    Long.toString(groupId),
                    Long.toString(subId),
                    groupName,
                    category.name,
                    category.color));
        }

        List<List<String>> transactions = remapCategoryColumn(
                dataDirectory.resolve("transactions.csv"), ids);
        List<List<String>> defaultCategories = remapCategoryColumn(
                dataDirectory.resolve("defaultcategories.csv"), ids);

        writeAtomically(file, migrated);
        if (transactions != null) {
            writeAtomically(dataDirectory.resolve("transactions.csv"), transactions);
        }
        if (defaultCategories != null) {
            writeAtomically(dataDirectory.resolve("defaultcategories.csv"), defaultCategories);
        }

        log.info("Migrated {} categories to explicit groups and remapped category ids",
                categories.size());
        return true;
    }

    private static List<List<String>> remapCategoryColumn(Path file, Map<Long, Long> ids)
            throws IOException {
        if (!Files.isRegularFile(file)) {
            return null;
        }
        List<List<String>> rows = read(file);
        if (rows.isEmpty()) {
            return null;
        }

        List<List<String>> remapped = new ArrayList<>(rows.size());
        remapped.add(rows.get(0));
        for (int index = 1; index < rows.size(); index++) {
            List<String> row = rows.get(index);
            if (isBlank(row)) {
                continue;
            }
            List<String> copy = new ArrayList<>(row);
            if (copy.size() > 1 && copy.get(1) != null && !copy.get(1).isBlank()) {
                long oldId;
                try {
                    oldId = Long.parseLong(copy.get(1).trim());
                } catch (NumberFormatException ex) {
                    log.warn("{} record {}: invalid category id '{}', left unchanged",
                            file.getFileName(), index, copy.get(1));
                    remapped.add(copy);
                    continue;
                }
                Long newId = ids.get(oldId);
                if (newId == null) {
                    log.warn("{} record {}: unknown category id {}, left unchanged",
                            file.getFileName(), index, oldId);
                } else {
                    copy.set(1, Long.toString(newId));
                }
            }
            remapped.add(copy);
        }
        return remapped;
    }

    private static List<List<String>> read(Path file) throws IOException {
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            return CsvUtils.parse(reader);
        }
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

    private static long parseId(String value, String location) {
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException ex) {
            throw new CsvException(location + ": invalid category id '" + value + "'");
        }
    }

    private static List<String> pad(List<String> row) {
        List<String> padded = new ArrayList<>(LEGACY_HEADER.size());
        for (int index = 0; index < LEGACY_HEADER.size(); index++) {
            padded.add(index < row.size() && row.get(index) != null ? row.get(index) : "");
        }
        return padded;
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
        Path temp = Files.createTempFile(file.getParent(), file.getFileName() + "-", ".tmp");
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

    private record LegacyCategory(long id, String name, String color) {
    }
}
