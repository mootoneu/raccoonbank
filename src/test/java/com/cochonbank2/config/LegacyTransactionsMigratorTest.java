package com.cochonbank2.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.cochonbank2.csv.CsvException;

class LegacyTransactionsMigratorTest {

    @TempDir
    Path tempDir;

    private final LegacyTransactionsMigrator migrator = new LegacyTransactionsMigrator();

    @Test
    void convertsLegacyColumnsAndDates() throws IOException {
        Files.writeString(tempDir.resolve("transactions.csv"),
                "Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Bill_Id\r\n"
                        + "2,,,7364.54,12/31/2016 00:00:00,,TOTAL,\r\n"
                        + "5,61,CB,-63.61,01/02/2017 00:00:00,12/29/2016 00:00:00,"
                        + "\"E.LECLERC, DRIVE\",INV-7\r\n"
                        + "6,62,CB,-26.97,01/02/2017 00:00:00,,ÉLECTRICITÉ,\r\n",
                StandardCharsets.UTF_8);

        assertTrue(migrator.migrate(tempDir));

        List<String> lines = Files.readAllLines(
                tempDir.resolve("transactions.csv"), StandardCharsets.UTF_8);
        assertEquals(
                "Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id",
                lines.get(0));
        assertEquals("2,,,7364.54,2016-12-31,2016-12-31,TOTAL,,", lines.get(1));
        assertEquals("5,61,CB,-63.61,2017-01-02,2016-12-29,\"E.LECLERC, DRIVE\",,INV-7",
                lines.get(2));
        assertEquals("6,62,CB,-26.97,2017-01-02,2017-01-02,ÉLECTRICITÉ,,", lines.get(3));
    }

    @Test
    void leavesCurrentFormatAlone() throws IOException {
        String content = "Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,"
                + "Description,Bill_Id\n"
                + "1,1,DEBIT,-42.15,2026-10-13,2026-10-12,CARREFOUR,,INV-42\n";
        Files.writeString(tempDir.resolve("transactions.csv"), content, StandardCharsets.UTF_8);

        assertFalse(migrator.migrate(tempDir));
        assertEquals(content, Files.readString(
                tempDir.resolve("transactions.csv"), StandardCharsets.UTF_8));
    }

    @Test
    void doesNothingWhenTheLedgerDoesNotExist() throws IOException {
        assertFalse(migrator.migrate(tempDir));
    }

    @Test
    void rejectsAnInvalidLegacyDateWithoutOverwritingTheFile() throws IOException {
        String content = "Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Bill_Id\n"
                + "1,1,DEBIT,-1.00,not-a-date,,BROKEN,\n";
        Files.writeString(tempDir.resolve("transactions.csv"), content, StandardCharsets.UTF_8);

        CsvException error = assertThrows(CsvException.class, () -> migrator.migrate(tempDir));

        assertTrue(error.getMessage().contains("BankDate"));
        assertEquals(content, Files.readString(
                tempDir.resolve("transactions.csv"), StandardCharsets.UTF_8));
    }

    @Test
    void acceptsIsoAndDateOnlyValuesToo() {
        assertEquals("2026-10-13", LegacyTransactionsMigrator.isoDate(
                "2026-10-13", 1, "BankDate"));
        assertEquals("2026-10-13", LegacyTransactionsMigrator.isoDate(
                "10/13/2026", 1, "BankDate"));
        assertEquals("", LegacyTransactionsMigrator.isoDate("", 1, "RealDate"));
    }
}
