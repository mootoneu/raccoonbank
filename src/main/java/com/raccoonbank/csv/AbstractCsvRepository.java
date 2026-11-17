package com.raccoonbank.csv;

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
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

    /**
     * Replaces {@code from} with {@code to} in the named numeric column of every
     * matching row. Other rows and columns are written back exactly as stored,
     * so values this application does not model are never rewritten.
     *
     * @return the number of rows changed
     */
    public int replaceLongValue(String column, long from, long to) {
        int index = columnIndex(column);
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return 0;
            }
            checkHeader(rows.get(0));
            List<List<String>> updated = new ArrayList<>(rows.size());
            updated.add(rows.get(0));
            int changed = 0;
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (!isBlank(row) && holdsLong(row, index, from)) {
                    List<String> copy = new ArrayList<>(pad(row));
                    copy.set(index, Long.toString(to));
                    updated.add(copy);
                    changed++;
                } else {
                    updated.add(row);
                }
            }
            if (changed == 0) {
                return 0;
            }
            writeRows(updated);
            return changed;
        } catch (IOException ex) {
            throw new CsvException("Cannot update " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    /**
     * Sets the named columns of the first row whose numeric key column holds
     * {@code key}. Other rows are written back exactly as stored.
     *
     * @return {@code true} when a matching row was found
     */
    public boolean updateRow(String keyColumn, long key, Map<String, String> values) {
        return updateRows(keyColumn, Set.of(key), values) > 0;
    }

    /**
     * Sets the named columns of every row whose numeric key column holds one of
     * {@code keys}. Other rows are written back exactly as stored.
     *
     * @return the number of rows changed
     */
    public int updateRows(String keyColumn, Set<Long> keys, Map<String, String> values) {
        int keyIndex = columnIndex(keyColumn);
        Map<Integer, String> changes = new LinkedHashMap<>();
        values.forEach((column, value) -> changes.put(columnIndex(column), value));
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return 0;
            }
            checkHeader(rows.get(0));
            List<List<String>> updated = new ArrayList<>(rows.size());
            updated.add(rows.get(0));
            int changed = 0;
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (!isBlank(row) && matchesAny(row, keyIndex, keys)) {
                    List<String> copy = new ArrayList<>(pad(row));
                    for (Map.Entry<Integer, String> change : changes.entrySet()) {
                        copy.set(change.getKey(), change.getValue());
                    }
                    updated.add(copy);
                    changed++;
                } else {
                    updated.add(row);
                }
            }
            if (changed == 0) {
                return 0;
            }
            writeRows(updated);
            return changed;
        } catch (IOException ex) {
            throw new CsvException("Cannot update " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    /**
     * Sets the named columns of every row whose text key column holds
     * {@code key}, ignoring case and surrounding whitespace. Other rows are
     * written back exactly as stored.
     *
     * @return the number of rows changed
     */
    public int updateRowsByText(String keyColumn, String key, Map<String, String> values) {
        int keyIndex = columnIndex(keyColumn);
        Map<Integer, String> changes = new LinkedHashMap<>();
        values.forEach((column, value) -> changes.put(columnIndex(column), value));
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return 0;
            }
            checkHeader(rows.get(0));
            List<List<String>> updated = new ArrayList<>(rows.size());
            updated.add(rows.get(0));
            int changed = 0;
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (!isBlank(row) && holdsText(row, keyIndex, key)) {
                    List<String> copy = new ArrayList<>(pad(row));
                    for (Map.Entry<Integer, String> change : changes.entrySet()) {
                        copy.set(change.getKey(), change.getValue());
                    }
                    updated.add(copy);
                    changed++;
                } else {
                    updated.add(row);
                }
            }
            if (changed == 0) {
                return 0;
            }
            writeRows(updated);
            return changed;
        } catch (IOException ex) {
            throw new CsvException("Cannot update " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    /**
     * Removes every row whose text column holds {@code value}, ignoring case
     * and surrounding whitespace.
     *
     * @return the number of rows removed
     */
    public int deleteRowsByText(String column, String value) {
        int index = columnIndex(column);
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return 0;
            }
            checkHeader(rows.get(0));
            List<List<String>> kept = new ArrayList<>(rows.size());
            kept.add(rows.get(0));
            int removed = 0;
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (!isBlank(row) && holdsText(row, index, value)) {
                    removed++;
                } else {
                    kept.add(row);
                }
            }
            if (removed == 0) {
                return 0;
            }
            writeRows(kept);
            return removed;
        } catch (IOException ex) {
            throw new CsvException("Cannot update " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    /**
     * Removes every row whose numeric column holds {@code value}.
     *
     * @return the number of rows removed
     */
    public int deleteLongValue(String column, long value) {
        int index = columnIndex(column);
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return 0;
            }
            checkHeader(rows.get(0));
            List<List<String>> kept = new ArrayList<>(rows.size());
            kept.add(rows.get(0));
            int removed = 0;
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (!isBlank(row) && holdsLong(row, index, value)) {
                    removed++;
                } else {
                    kept.add(row);
                }
            }
            if (removed == 0) {
                return 0;
            }
            writeRows(kept);
            return removed;
        } catch (IOException ex) {
            throw new CsvException("Cannot update " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    /**
     * Replaces the values of the data row at {@code index}, counting only
     * non-blank rows after the header (the same rows {@link #findAll()} reads).
     * Other rows are written back exactly as stored.
     *
     * @return {@code true} when a row at that index existed
     */
    public boolean updateRowAt(int index, Map<String, String> values) {
        if (index < 0) {
            return false;
        }
        Map<Integer, String> changes = new LinkedHashMap<>();
        values.forEach((column, value) -> changes.put(columnIndex(column), value));
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return false;
            }
            checkHeader(rows.get(0));
            List<List<String>> updated = new ArrayList<>(rows.size());
            updated.add(rows.get(0));
            int current = -1;
            boolean changed = false;
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (isBlank(row)) {
                    updated.add(row);
                    continue;
                }
                current++;
                if (current == index) {
                    List<String> copy = new ArrayList<>(pad(row));
                    for (Map.Entry<Integer, String> change : changes.entrySet()) {
                        copy.set(change.getKey(), change.getValue());
                    }
                    updated.add(copy);
                    changed = true;
                } else {
                    updated.add(row);
                }
            }
            if (changed) {
                writeRows(updated);
            }
            return changed;
        } catch (IOException ex) {
            throw new CsvException("Cannot update " + file + ": " + ex.getMessage(), ex);
        } finally {
            lock.unlock();
        }
    }

    /**
     * Removes the data row at {@code index}, counting only non-blank rows after
     * the header. Other rows are written back exactly as stored.
     *
     * @return {@code true} when a row at that index existed
     */
    public boolean deleteRowAt(int index) {
        if (index < 0) {
            return false;
        }
        lock.lock();
        try {
            ensureExists();
            List<List<String>> rows = readRows();
            if (rows.isEmpty()) {
                return false;
            }
            checkHeader(rows.get(0));
            List<List<String>> kept = new ArrayList<>(rows.size());
            kept.add(rows.get(0));
            int current = -1;
            boolean removed = false;
            for (int i = 1; i < rows.size(); i++) {
                List<String> row = rows.get(i);
                if (isBlank(row)) {
                    kept.add(row);
                    continue;
                }
                current++;
                if (current == index) {
                    removed = true;
                } else {
                    kept.add(row);
                }
            }
            if (removed) {
                writeRows(kept);
            }
            return removed;
        } catch (IOException ex) {
            throw new CsvException("Cannot update " + file + ": " + ex.getMessage(), ex);
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

    private void writeRows(List<List<String>> rows) throws IOException {
        Path temp = file.resolveSibling(file.getFileName() + ".tmp");
        try (BufferedWriter writer = Files.newBufferedWriter(
                temp, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
            for (List<String> row : rows) {
                CsvUtils.writeRow(writer, row);
            }
        }
        Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
    }

    private int columnIndex(String column) {
        for (int i = 0; i < header.size(); i++) {
            if (header.get(i).equalsIgnoreCase(column)) {
                return i;
            }
        }
        throw new IllegalArgumentException(displayName + " has no column " + column);
    }

    private static boolean matchesAny(List<String> row, int index, Set<Long> keys) {
        if (index >= row.size()) {
            return false;
        }
        try {
            return keys.contains(Long.parseLong(text(row, index)));
        } catch (NumberFormatException ex) {
            return false;
        }
    }

    private static boolean holdsText(List<String> row, int index, String expected) {
        if (index >= row.size() || expected == null) {
            return false;
        }
        return text(row, index).equalsIgnoreCase(expected.trim());
    }

    private static boolean holdsLong(List<String> row, int index, long expected) {
        if (index >= row.size()) {
            return false;
        }
        try {
            return Long.parseLong(text(row, index)) == expected;
        } catch (NumberFormatException ex) {
            return false;
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
