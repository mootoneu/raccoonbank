package com.raccoonbank.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LegacyDefaultCategoriesMigratorTest {

    @TempDir
    Path tempDir;

    private final LegacyDefaultCategoriesMigrator migrator = new LegacyDefaultCategoriesMigrator();

    @Test
    void addsTheDescriptionColumn() throws IOException {
        Files.writeString(tempDir.resolve("defaultcategories.csv"),
                "Id,Category_Id,Pattern\n"
                        + "2,1,CARREFOUR\n"
                        + "3,2,\"RESTO, LE PONT\"\n",
                StandardCharsets.UTF_8);

        assertTrue(migrator.migrate(tempDir));

        List<String> lines = Files.readAllLines(
                tempDir.resolve("defaultcategories.csv"), StandardCharsets.UTF_8);
        assertEquals("Id,Category_Id,Pattern,Description", lines.get(0));
        assertEquals("2,1,CARREFOUR,", lines.get(1));
        assertEquals("3,2,\"RESTO, LE PONT\",", lines.get(2));
    }

    @Test
    void leavesCurrentFormatAlone() throws IOException {
        String content = "Id,Category_Id,Pattern,Description\n"
                + "1,1,LIDL,Weekly shop\n";
        Files.writeString(tempDir.resolve("defaultcategories.csv"), content, StandardCharsets.UTF_8);

        assertFalse(migrator.migrate(tempDir));
        assertEquals(content, Files.readString(
                tempDir.resolve("defaultcategories.csv"), StandardCharsets.UTF_8));
    }

    @Test
    void doesNothingWhenTheFileDoesNotExist() throws IOException {
        assertFalse(migrator.migrate(tempDir));
    }
}
