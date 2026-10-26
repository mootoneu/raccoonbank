package com.cochonbank2.csv;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.Reader;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Base class for the three CSV backed repositories. Reads are done in full and
 * appends are serialized with a lock. Files are created with their header when
 * they do not exist yet.
 */
public abstract class AbstractCsvRepository<T> {

    private final Path file;
    private final List<String> header;
    private final String displayName;
    private final ReentrantLock lock = new ReentrantLock();

    protected AbstractCsvRepository(Path dataDirectory, String fileName, List<String> header) {
        this.file = dataDirectory.resolve(fileName).toAbsolutePath().normalize();
        this.header = List.copyOf(header);
        this.displayName = fileName;
    }

    public Path file() {
        return file;
    }

    public List<T> findAll() {
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return new ArrayList<>();
            }
            checkHeader(rows.get(0));
            List<T> values = new ArrayList<>();
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (isBlank(row)) {
                    continue;
                }
                if (row.size() > header.size()) {
                    throw new CsvException("record " + i + " has too many columns (expected "
                            + header.size() + ", got " + row.size() + ")");
                }
                List<String> padded = pad(row);
                try {
                    values.add(fromRow(padded));
                } catch (RuntimeException ex) {
                    throw new CsvException(displayName + " record " + i + ": " + ex.getMessage(), ex);
                }
            }
            return values;
        } catch (IOException ex) {
            throw new CsvException("Cannot read " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    public void appendAll(List<T> values) {
        if (values == null || values.isEmpty()) {
            return;
        }
        lock.lock();
        try {
            ensureExists();
            try (BufferedWriter writer = Files.newBufferedWriter(
                    file, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
                if (!endsWithLineBreak()) {
                    writer.write('\n');
                }
                for (T value : values) {
                    CsvUtils.writeRow(writer, toRow(value));
                }
            }
        } catch (IOException ex) {
            throw new CsvException("Cannot write " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    protected abstract T fromRow(List<String> row);

    protected abstract List<String> toRow(T value);

    protected List<String> header() {
        return header;
    }

    protected static String text(List<String> row, int index) {
        String value = row.get(index);
        return value == null ? "" : value.trim();
    }

    protected static String requiredText(List<String> row, int index, String field) {
        String value = text(row, index);
        if (value.isBlank()) {
            throw new CsvException(field + " is required");
        }
        return value;
    }

    protected static long requiredLong(List<String> row, int index, String field) {
        String value = text(row, index);
        if (value.isBlank()) {
            throw new CsvException(field + " is required");
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            throw new CsvException(field + " is not a valid integer: '" + value + "'");
        }
    }

    protected static long optionalLong(List<String> row, int index, long fallback) {
        String value = text(row, index);
        if (value.isBlank()) {
            return fallback;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            throw new CsvException("not a valid integer: '" + value + "'");
        }
    }

    protected static BigDecimal requiredDecimal(List<String> row, int index, String field) {
        String value = text(row, index);
        if (value.isBlank()) {
            throw new CsvException(field + " is required");
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException ex) {
            throw new CsvException(field + " is not a valid number: '" + value + "'");
        }
    }

    protected static LocalDate optionalDate(List<String> row, int index, String field) {
        String value = text(row, index);
        if (value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw new CsvException(field + " is not a valid ISO date: '" + value + "'");
        }
    }

    private List<List<String>> readRows() throws IOException {
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            return CsvUtils.parse(reader);
        }
    }

    private void checkHeader(List<String> actual) {
        if (actual.size() != header.size()) {
            throw new CsvException(displayName + ": expected header " + CsvUtils.formatRow(header)
                    + " but found " + CsvUtils.formatRow(actual));
        }
        for (int i = 0; i < header.size(); i++) {
            if (!header.get(i).equalsIgnoreCase(actual.get(i).trim())) {
                throw new CsvException(displayName + ": expected header " + CsvUtils.formatRow(header)
                        + " but found " + CsvUtils.formatRow(actual));
            }
        }
    }

    private void ensureExists() throws IOException {
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        if (Files.exists(file) && Files.size(file) > 0) {
            return;
        }
        if (Files.exists(file)) {
            try (BufferedWriter writer = Files.newBufferedWriter(
                    file, StandardCharsets.UTF_8, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                CsvUtils.writeRow(writer, header);
            }
            return;
        }
        try (BufferedWriter writer = Files.newBufferedWriter(
                file, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            CsvUtils.writeRow(writer, header);
        }
    }

    private boolean endsWithLineBreak() throws IOException {
        if (Files.size(file) == 0) {
            return true;
        }
        try (SeekableByteChannel channel = Files.newByteChannel(file, StandardOpenOption.READ)) {
            channel.position(channel.size() - 1);
            ByteBuffer buffer = ByteBuffer.allocate(1);
            channel.read(buffer);
            byte last = buffer.array()[0];
            return last == '\n' || last == '\r';
        }
    }

    private List<String> pad(List<String> row) {
        List<String> padded = new ArrayList<>(row);
        while (padded.size() < header.size()) {
            padded.add("");
        }
        return padded;
    }

    private static boolean isBlank(List<String> row) {
        return row.stream().allMatch(value -> value == null || value.isBlank());
    }
}
