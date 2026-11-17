package com.raccoonbank.config;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.raccoonbank.csv.CsvException;
import com.raccoonbank.csv.CsvUtils;

/**
 * Converts ledger files written by the first RaccoonBank version. Those files
 * have no Description column and store dates as {@code MM/dd/yyyy HH:mm:ss}.
 * The migration runs once at startup, after the rolling backup has copied the
 * original file, and rewrites the ledger in the current 9-column ISO format.
 */
@Component
public class LegacyTransactionsMigrator {

    static final List<String> LEGACY_HEADER = List.of(
            "Id", "Category_Id", "PaymentType", "Amount", "BankDate",
            "RealDate", "Title", "Bill_Id");
    static final List<String> CURRENT_HEADER = List.of(
            "Id", "Category_Id", "PaymentType", "Amount", "BankDate",
            "RealDate", "Title", "Description", "Bill_Id");

    private static final Logger log = LoggerFactory.getLogger(LegacyTransactionsMigrator.class);
    private static final DateTimeFormatter LEGACY_DATE_TIME =
            DateTimeFormatter.ofPattern("M/d/uuuu H:mm:ss");
    private static final DateTimeFormatter LEGACY_DATE =
            DateTimeFormatter.ofPattern("M/d/uuuu");

    /**
     * @return true when a legacy ledger was found and rewritten
     */
    public boolean migrate(Path dataDirectory) throws IOException {
        Path file = dataDirectory.resolve("transactions.csv");
        if (!Files.isRegularFile(file)) {
            return false;
        }

        List<List<String>> rows;
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            rows = CsvUtils.parse(reader);
        }
        if (rows.isEmpty() || !LEGACY_HEADER.equals(rows.get(0))) {
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
            List<String> padded = pad(row);
            String bankDate = isoDate(padded.get(4), index, "BankDate");
            String realDate = isoDate(padded.get(5), index, "RealDate");
            if (realDate.isEmpty()) {
                realDate = bankDate;
            }
            migrated.add(List.of(
                    padded.get(0),
                    padded.get(1),
                    padded.get(2),
                    padded.get(3),
                    bankDate,
                    realDate,
                    padded.get(6),
                    "",
                    padded.get(7)));
            count++;
        }

        writeAtomically(file, migrated);
        log.info("Migrated {} legacy transactions in {} to the current CSV format",
                count, file);
        return true;
    }

    private static void writeAtomically(Path file, List<List<String>> rows) throws IOException {
        Path temp = Files.createTempFile(file.getParent(), "transactions-", ".csv.tmp");
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

    static String isoDate(String value, int record, String field) {
        String date = value == null ? "" : value.trim();
        if (date.isEmpty()) {
            return "";
        }
        try {
            if (date.length() >= 10 && date.charAt(4) == '-' && date.charAt(7) == '-') {
                return LocalDate.parse(date.substring(0, 10)).toString();
            }
            if (date.length() > 10) {
                return LocalDateTime.parse(date, LEGACY_DATE_TIME).toLocalDate().toString();
            }
            return LocalDate.parse(date, LEGACY_DATE).toString();
        } catch (DateTimeParseException ex) {
            throw new CsvException("transactions.csv record " + record
                    + ": invalid " + field + " date '" + value + "'");
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
}
