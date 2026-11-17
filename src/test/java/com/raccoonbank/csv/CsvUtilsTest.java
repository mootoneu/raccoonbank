package com.raccoonbank.csv;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.StringReader;
import java.io.StringWriter;
import java.util.List;

import org.junit.jupiter.api.Test;

class CsvUtilsTest {

    @Test
    void parsesQuotedFieldsCommasAndEmbeddedNewlines() throws Exception {
        String csv = "Id,Title,Description\r\n"
                + "1,\"Hello, world\",\"Line one\nLine two\"\r\n"
                + "2,\"A \"\"quoted\"\" value\",\"\"\r\n";

        List<List<String>> rows = CsvUtils.parse(new StringReader(csv));

        assertEquals(3, rows.size());
        assertEquals(List.of("Id", "Title", "Description"), rows.get(0));
        assertEquals(List.of("1", "Hello, world", "Line one\nLine two"), rows.get(1));
        assertEquals(List.of("2", "A \"quoted\" value", ""), rows.get(2));
    }

    @Test
    void ignoresByteOrderMark() throws Exception {
        List<List<String>> rows = CsvUtils.parse(new StringReader("\uFEFFId,Name\n1,Groceries\n"));

        assertEquals(List.of("Id", "Name"), rows.get(0));
        assertEquals(List.of("1", "Groceries"), rows.get(1));
    }

    @Test
    void handlesEmptyFileAndBlankLines() throws Exception {
        assertEquals(0, CsvUtils.parse(new StringReader("")).size());

        List<List<String>> rows = CsvUtils.parse(new StringReader("Id,Name\n\n1,LIDL\n"));
        assertEquals(3, rows.size());
        assertEquals(List.of(""), rows.get(1));
    }

    @Test
    void writesFieldsThatNeedQuoting() {
        String row = CsvUtils.formatRow(List.of(
                "1",
                "A, B",
                "say \"hi\"",
                "line\nbreak",
                " padded ",
                ""));

        assertEquals("1,\"A, B\",\"say \"\"hi\"\"\",\"line\nbreak\",\" padded \",", row);
    }

    @Test
    void roundTripsUnexpectedValues() throws Exception {
        List<String> values = List.of("1", "Café, \"thé\"", "multi\nline", "  spaces  ", "");
        StringWriter writer = new StringWriter();
        CsvUtils.writeRow(writer, values);

        List<List<String>> rows = CsvUtils.parse(new StringReader(writer.toString()));
        assertEquals(values, rows.get(0));
    }

    @Test
    void rejectsUnterminatedQuotedField() {
        assertThrows(CsvException.class,
                () -> CsvUtils.parse(new StringReader("1,\"unclosed\n")));
    }
}
