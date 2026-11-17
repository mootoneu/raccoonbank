package com.raccoonbank.ofx;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

class OfxParserTest {

    private final OfxParser parser = new OfxParser();

    @Test
    void parsesSgmlStatementsWithUnclosedFieldTags() {
        String ofx = """
                OFXHEADER:100
                DATA:OFXSGML
                VERSION:102
                ENCODING:USASCII
                CHARSET:1252

                <OFX>
                <BANKMSGSRSV1>
                <STMTTRNRS>
                <STMTRS>
                <BANKTRANLIST>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261013120000
                <TRNAMT>-42.15
                <FITID>001
                <NAME>CARREFOUR MARKET 12/10/26
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>CREDIT
                <DTPOSTED>20261002080000[-5:EST]
                <TRNAMT>2450.00
                <FITID>002
                <NAME>SALAIRE 02/10/26
                </STMTTRN>
                </BANKTRANLIST>
                </STMTRS>
                </STMTTRNRS>
                </BANKMSGSRSV1>
                </OFX>
                """;

        OfxParseResult result = parser.parse(ofx.getBytes(StandardCharsets.US_ASCII));

        assertEquals(2, result.statements().size());
        assertTrue(result.warnings().isEmpty());

        OfxStatement first = result.statements().get(0);
        assertEquals("DEBIT", first.transactionType());
        assertEquals(LocalDate.of(2026, 10, 13), first.bankDate());
        assertEquals(new BigDecimal("-42.15"), first.amount());
        assertEquals("CARREFOUR MARKET 12/10/26", first.name());

        OfxStatement second = result.statements().get(1);
        assertEquals("CREDIT", second.transactionType());
        assertEquals(LocalDate.of(2026, 10, 2), second.bankDate());
        assertEquals(new BigDecimal("2450.00"), second.amount());
    }

    @Test
    void parsesOfxXmlWithEntitiesAndUtf8() {
        String xml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <OFX>
                  <BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
                    <STMTTRN>
                      <TRNTYPE>POS</TRNTYPE>
                      <DTPOSTED>20261012</DTPOSTED>
                      <TRNAMT>-5.50</TRNAMT>
                      <NAME>Café &amp; Co 03/10/26</NAME>
                      <MEMO>Card payment</MEMO>
                    </STMTTRN>
                  </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
                </OFX>
                """;

        OfxParseResult result = parser.parse(xml.getBytes(StandardCharsets.UTF_8));

        assertEquals(1, result.statements().size());
        assertEquals("Café & Co 03/10/26", result.statements().get(0).name());
        assertEquals("Card payment", result.statements().get(0).memo());
        assertEquals(LocalDate.of(2026, 10, 12), result.statements().get(0).bankDate());
    }

    @Test
    void decodesWindows1252WhenDeclared() {
        Charset windows1252 = Charset.forName("windows-1252");
        String ofx = """
                OFXHEADER:100
                CHARSET:1252

                <OFX><BANKTRANLIST>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261001
                <TRNAMT>-3.20
                <NAME>CAFÉ DU COIN 01/10/26
                </STMTTRN>
                </BANKTRANLIST></OFX>
                """;

        OfxParseResult result = parser.parse(ofx.getBytes(windows1252));

        assertEquals(1, result.statements().size());
        assertEquals("CAFÉ DU COIN 01/10/26", result.statements().get(0).name());
    }

    @Test
    void skipsInvalidStatementsWithWarnings() {
        String ofx = """
                <OFX><BANKTRANLIST>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>not-a-date
                <TRNAMT>-10.00
                <NAME>BROKEN DATE
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261010
                <TRNAMT>not-a-number
                <NAME>BROKEN AMOUNT
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>CREDIT
                <DTPOSTED>20261011
                <TRNAMT>12.34
                <NAME>GOOD ONE
                </STMTTRN>
                </BANKTRANLIST></OFX>
                """;

        OfxParseResult result = parser.parse(ofx.getBytes(StandardCharsets.UTF_8));

        assertEquals(1, result.statements().size());
        assertEquals("GOOD ONE", result.statements().get(0).name());
        assertEquals(2, result.warnings().size());
        assertTrue(result.warnings().get(0).contains("DTPOSTED"));
        assertTrue(result.warnings().get(1).contains("TRNAMT"));
    }

    @Test
    void supportsCommaDecimalAmountsAndMissingName() {
        String ofx = """
                <OFX><BANKTRANLIST>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261012
                <TRNAMT>-1 234,56
                <MEMO>Fallback memo
                </STMTTRN>
                </BANKTRANLIST></OFX>
                """;

        OfxParseResult result = parser.parse(ofx.getBytes(StandardCharsets.UTF_8));

        assertEquals(1, result.statements().size());
        assertEquals(new BigDecimal("-1234.56"), result.statements().get(0).amount());
        assertEquals("Fallback memo", result.statements().get(0).name());
    }

    @Test
    void reportsEmptyAndStatementsLessFiles() {
        OfxParseResult empty = parser.parse(new byte[0]);
        assertNotNull(empty.warnings());
        assertEquals(1, empty.warnings().size());

        OfxParseResult noStatements = parser.parse("<OFX></OFX>".getBytes(StandardCharsets.UTF_8));
        assertEquals(0, noStatements.statements().size());
        assertTrue(noStatements.warnings().get(0).contains("No STMTTRN"));
    }

    @Test
    void handlesOptionalTimezoneAndTimeInPostedDate() {
        String ofx = """
                <OFX><BANKTRANLIST><STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261231235959.000[-5:EST]
                <TRNAMT>-1.00
                <NAME>NEW YEAR
                </STMTTRN></BANKTRANLIST></OFX>
                """;

        List<OfxStatement> statements = parser.parse(ofx.getBytes(StandardCharsets.UTF_8)).statements();

        assertEquals(LocalDate.of(2026, 12, 31), statements.get(0).bankDate());
    }
}
