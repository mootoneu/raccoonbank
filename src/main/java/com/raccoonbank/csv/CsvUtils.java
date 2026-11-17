package com.raccoonbank.csv;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.util.ArrayList;
import java.util.List;

/**
 * Small RFC 4180 style CSV reader/writer. It supports quoted fields, escaped
 * quotes ("") and line breaks inside quoted fields. No external dependency is
 * needed for the simple files used by the application.
 */
public final class CsvUtils {

    private CsvUtils() {
    }

    /**
     * Parses the whole CSV stream. A UTF-8 byte order mark at the beginning is
     * ignored by callers decoding as UTF-8; here we also skip the BOM character.
     */
    public static List<List<String>> parse(Reader reader) throws IOException {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;

        int next = reader.read();
        if (next == '\uFEFF') {
            next = reader.read();
        }

        while (next != -1) {
            char ch = (char) next;
            if (inQuotes) {
                if (ch == '"') {
                    int afterQuote = reader.read();
                    if (afterQuote == '"') {
                        field.append('"');
                        next = reader.read();
                    } else {
                        inQuotes = false;
                        next = afterQuote;
                    }
                } else {
                    field.append(ch);
                    next = reader.read();
                }
            } else if (ch == '"') {
                inQuotes = true;
                next = reader.read();
            } else if (ch == ',') {
                row.add(field.toString());
                field.setLength(0);
                next = reader.read();
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r') {
                    int afterCr = reader.read();
                    next = afterCr == '\n' ? reader.read() : afterCr;
                } else {
                    next = reader.read();
                }
                row.add(field.toString());
                field.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else {
                field.append(ch);
                next = reader.read();
            }
        }

        if (inQuotes) {
            throw new CsvException("Unterminated quoted field");
        }
        if (field.length() > 0 || !row.isEmpty()) {
            row.add(field.toString());
            rows.add(row);
        }
        return rows;
    }

    public static void writeRow(Writer writer, List<String> values) throws IOException {
        writer.write(formatRow(values));
        writer.write('\n');
    }

    public static String formatRow(List<String> values) {
        StringBuilder line = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                line.append(',');
            }
            line.append(escape(values.get(i)));
        }
        return line.toString();
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        boolean needsQuotes = value.indexOf(',') >= 0
                || value.indexOf('"') >= 0
                || value.indexOf('\n') >= 0
                || value.indexOf('\r') >= 0
                || (!value.isEmpty()
                    && (Character.isWhitespace(value.charAt(0))
                        || Character.isWhitespace(value.charAt(value.length() - 1))));
        if (!needsQuotes) {
            return value;
        }
        return '"' + value.replace("\"", "\"\"") + '"';
    }
}
