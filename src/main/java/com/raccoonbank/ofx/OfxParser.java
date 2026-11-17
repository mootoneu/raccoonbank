package com.raccoonbank.ofx;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Tolerant OFX 1.x (SGML) / OFX 2.x (XML) statement parser. Only the fields
 * required by RaccoonBank are extracted: TRNTYPE, DTPOSTED, TRNAMT, NAME and
 * MEMO.
 */
@Component
public class OfxParser {

    private static final Pattern STATEMENT_BLOCK = Pattern.compile(
            "(?is)<STMTTRN\\b[^>]*>(.*?)(?:</STMTTRN\\s*>|(?=<STMTTRN\\b)|(?=</BANKTRANLIST\\s*>)|\\z)");

    private static final Pattern OFX_DATE = Pattern.compile("^\\s*(\\d{4})(\\d{2})(\\d{2})");
    private static final Pattern HEADER_FIELD = Pattern.compile(
            "(?im)^\\s*(CHARSET|ENCODING)\\s*:\\s*([^\\r\\n]+)");

    public OfxParseResult parse(byte[] content) {
        List<String> warnings = new ArrayList<>();
        if (content == null || content.length == 0) {
            return new OfxParseResult(List.of(), List.of("The OFX file is empty."));
        }

        String text = decode(content);
        Matcher blocks = STATEMENT_BLOCK.matcher(text);
        List<OfxStatement> statements = new ArrayList<>();
        int index = 0;

        while (blocks.find()) {
            index++;
            String block = blocks.group(1);
            String type = field(block, "TRNTYPE");
            String rawDate = field(block, "DTPOSTED");
            String rawAmount = field(block, "TRNAMT");
            String name = field(block, "NAME");
            String memo = field(block, "MEMO");

            LocalDate bankDate = parseDate(rawDate);
            if (bankDate == null) {
                warnings.add("Transaction " + index + " skipped: invalid or missing DTPOSTED '" + rawDate + "'.");
                continue;
            }
            BigDecimal amount = parseAmount(rawAmount);
            if (amount == null) {
                warnings.add("Transaction " + index + " skipped: invalid or missing TRNAMT '" + rawAmount + "'.");
                continue;
            }
            if (name.isBlank()) {
                name = memo.isBlank() ? "Unknown transaction" : memo;
            }

            statements.add(new OfxStatement(type, bankDate, amount, name, memo));
        }

        if (index == 0) {
            warnings.add("No STMTTRN block was found in this OFX file.");
        }
        return new OfxParseResult(statements, warnings);
    }

    private static String field(String block, String tag) {
        Matcher matcher = Pattern.compile("(?is)<" + tag + "\\s*>([^<]*)").matcher(block);
        if (!matcher.find()) {
            return "";
        }
        return decodeEntities(matcher.group(1)).replaceAll("\\s+", " ").trim();
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        Matcher matcher = OFX_DATE.matcher(raw);
        if (!matcher.find()) {
            return null;
        }
        try {
            return LocalDate.of(
                    Integer.parseInt(matcher.group(1)),
                    Integer.parseInt(matcher.group(2)),
                    Integer.parseInt(matcher.group(3)));
        } catch (DateTimeException | NumberFormatException ex) {
            return null;
        }
    }

    private static BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String value = raw.replace(" ", "").replace("\u00A0", "");
        if (value.contains(",")) {
            if (value.contains(".")) {
                if (value.lastIndexOf(',') > value.lastIndexOf('.')) {
                    value = value.replace(".", "").replace(',', '.');
                } else {
                    value = value.replace(",", "");
                }
            } else {
                value = value.replace(',', '.');
            }
        }
        value = value.replaceAll("[^0-9+\\-.]", "");
        if (value.isBlank() || value.equals("+") || value.equals("-") || value.equals(".")) {
            return null;
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String decode(byte[] content) {
        if (content.length >= 3
                && (content[0] & 0xFF) == 0xEF
                && (content[1] & 0xFF) == 0xBB
                && (content[2] & 0xFF) == 0xBF) {
            return new String(content, 3, content.length - 3, StandardCharsets.UTF_8);
        }
        return new String(content, detectCharset(content));
    }

    private static Charset detectCharset(byte[] content) {
        String head = new String(content, 0, Math.min(content.length, 4096), StandardCharsets.ISO_8859_1);
        Matcher matcher = HEADER_FIELD.matcher(head);
        Charset declared = null;
        while (matcher.find()) {
            String value = matcher.group(2).trim().toUpperCase();
            if (value.contains("UTF")) {
                declared = StandardCharsets.UTF_8;
            } else if (value.contains("1252")) {
                declared = Charset.forName("windows-1252");
            } else if (value.contains("8859") || value.contains("LATIN")) {
                declared = StandardCharsets.ISO_8859_1;
            } else if (value.contains("ASCII")) {
                declared = StandardCharsets.ISO_8859_1;
            }
        }
        if (declared != null) {
            return declared;
        }
        if (hasNonAsciiBytes(content) && isValidUtf8(content)) {
            return StandardCharsets.UTF_8;
        }
        return Charset.forName("windows-1252");
    }

    private static boolean hasNonAsciiBytes(byte[] content) {
        for (byte value : content) {
            if (value < 0) {
                return true;
            }
        }
        return false;
    }

    private static boolean isValidUtf8(byte[] content) {
        try {
            StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(content));
            return true;
        } catch (CharacterCodingException ex) {
            return false;
        }
    }

    private static String decodeEntities(String value) {
        StringBuilder result = new StringBuilder(value.length());
        Matcher matcher = Pattern.compile("&(#x?[0-9a-fA-F]+|[a-zA-Z]+);").matcher(value);
        int last = 0;
        while (matcher.find()) {
            result.append(value, last, matcher.start());
            String entity = matcher.group(1);
            switch (entity) {
                case "amp" -> result.append('&');
                case "lt" -> result.append('<');
                case "gt" -> result.append('>');
                case "quot" -> result.append('"');
                case "apos" -> result.append('\'');
                case "nbsp" -> result.append(' ');
                default -> {
                    try {
                        if (entity.startsWith("#x") || entity.startsWith("#X")) {
                            result.appendCodePoint(Integer.parseInt(entity.substring(2), 16));
                        } else if (entity.startsWith("#")) {
                            result.appendCodePoint(Integer.parseInt(entity.substring(1)));
                        } else {
                            result.append(matcher.group());
                        }
                    } catch (IllegalArgumentException ex) {
                        result.append(matcher.group());
                    }
                }
            }
            last = matcher.end();
        }
        result.append(value, last, value.length());
        return result.toString();
    }
}
