package com.cochonbank2.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.DefaultCategory;
import com.cochonbank2.domain.TransactionDraft;
import com.cochonbank2.ofx.OfxParser;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.DefaultCategoryRepository;

class OfxImportServiceTest {

    @TempDir
    Path tempDir;

    private OfxImportService service;

    @BeforeEach
    void setUp() {
        CochonbankProperties properties = new CochonbankProperties(tempDir.toString());
        CategoryRepository categoryRepository = new CategoryRepository(properties);
        DefaultCategoryRepository defaultCategoryRepository = new DefaultCategoryRepository(properties);

        categoryRepository.appendAll(List.of(
                new Category(1, "Groceries", "#2E7D32"),
                new Category(2, "Restaurants", "#EF6C00"),
                new Category(3, "Income", "#1B5E20"),
                new Category(4, "Fine dining", "#AD1457")));

        defaultCategoryRepository.appendAll(List.of(
                new DefaultCategory(1, 1, "CARREFOUR", ""),
                new DefaultCategory(2, 1, "LIDL", ""),
                new DefaultCategory(3, 2, "RESTAURANT", "Dinner out"),
                new DefaultCategory(4, 4, "RESTAURANT LE PONT", ""),
                new DefaultCategory(5, 3, "SALAIRE", ""),
                new DefaultCategory(6, 2, "boulangerie", "Bread")));

        service = new OfxImportService(
                new OfxParser(), categoryRepository, defaultCategoryRepository);
    }

    @Test
    void convertsStatementsAndAppliesLongestMatchingDefaultCategory() {
        String ofx = """
                <OFX><BANKTRANLIST>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261013
                <TRNAMT>-42.15
                <NAME>CARREFOUR MARKET 12/10/26
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261014
                <TRNAMT>-8.20
                <NAME>carrefour city 13/10/26
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261016
                <TRNAMT>-75.00
                <NAME>RESTAURANT LE PONT 15/10/26
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>CREDIT
                <DTPOSTED>20261002
                <TRNAMT>2450.00
                <NAME>SALAIRE OCTOBRE 02/10/26
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>XFER
                <DTPOSTED>20261021
                <TRNAMT>-200.00
                <NAME>VIREMENT PONT 20/10/26
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261022
                <TRNAMT>-4.00
                <NAME>MYSTERY MERCHANT
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>POS
                <DTPOSTED>20261023
                <TRNAMT>-6.00
                <NAME>BROKEN 32/13/26
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261019
                <TRNAMT>-3.50
                <NAME>BOULANGERIE PAUL 18/10/26
                </STMTTRN>
                </BANKTRANLIST></OFX>
                """;

        OfxImportResult result = service.importFile(multipart(ofx));

        assertEquals("statement.ofx", result.fileName());
        assertEquals(8, result.transactions().size());
        assertTrue(result.warnings().isEmpty());

        TransactionDraft groceries = result.transactions().get(0);
        assertEquals(1L, groceries.categoryId());
        assertEquals("CARREFOUR MARKET", groceries.title());
        assertEquals(LocalDate.of(2026, 10, 12), groceries.realDate());
        assertEquals(LocalDate.of(2026, 10, 13), groceries.bankDate());
        assertEquals(new BigDecimal("-42.15"), groceries.amount());
        assertEquals("DEBIT", groceries.paymentType());
        assertEquals("", groceries.description());
        assertEquals("", groceries.billId());

        assertEquals(1L, result.transactions().get(1).categoryId());
        assertEquals("carrefour city", result.transactions().get(1).title());

        assertEquals(4L, result.transactions().get(2).categoryId(),
                "the longest matching rule must win");
        assertEquals("RESTAURANT LE PONT", result.transactions().get(2).title());
        assertEquals("", result.transactions().get(2).description());

        assertEquals(3L, result.transactions().get(3).categoryId());
        assertEquals("SALAIRE OCTOBRE", result.transactions().get(3).title());

        assertEquals(0L, result.transactions().get(4).categoryId());
        assertEquals("VIREMENT PONT", result.transactions().get(4).title());

        assertEquals(0L, result.transactions().get(5).categoryId());
        assertEquals("MYSTERY MERCHANT", result.transactions().get(5).title());
        assertEquals(LocalDate.of(2026, 10, 22), result.transactions().get(5).realDate(),
                "missing real date falls back to the bank date");

        assertEquals("BROKEN 32/13/26", result.transactions().get(6).title());
        assertEquals(LocalDate.of(2026, 10, 23), result.transactions().get(6).realDate(),
                "an invalid real date falls back to the bank date");

        assertEquals(2L, result.transactions().get(7).categoryId(),
                "a rule matches whatever the capitalization");
        assertEquals("BOULANGERIE PAUL", result.transactions().get(7).title());
        assertEquals("Bread", result.transactions().get(7).description(),
                "the rule description is copied onto the draft");
    }

    @Test
    void matchesRulesIgnoringCaseAndWhitespace() {
        DefaultCategory rule = new DefaultCategory(7, 2, "  RESTAURANT   CHEZ  PAUL ", "Dinner out");
        String ofx = """
                <OFX><BANKTRANLIST>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261018
                <TRNAMT>-31.00
                <NAME>restaurant chez paul 17/10/26
                </STMTTRN>
                </BANKTRANLIST></OFX>
                """;

        DefaultCategory matched = OfxImportService.findRule("restaurant chez paul", List.of(rule));

        assertEquals(rule, matched);
        TransactionDraft draft = service.importFile(multipart(ofx)).transactions().get(0);
        assertEquals(2L, draft.categoryId());
        assertEquals("restaurant chez paul", draft.title());
        assertEquals("Dinner out", draft.description());
    }

    @Test
    void passesParserWarningsThroughAndKeepsValidTransactions() {
        String ofx = """
                <OFX><BANKTRANLIST>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>nope
                <TRNAMT>-10.00
                <NAME>BROKEN
                </STMTTRN>
                <STMTTRN>
                <TRNTYPE>DEBIT
                <DTPOSTED>20261010
                <TRNAMT>-10.00
                <NAME>LIDL 09/10/26
                </STMTTRN>
                </BANKTRANLIST></OFX>
                """;

        OfxImportResult result = service.importFile(multipart(ofx));

        assertEquals(1, result.transactions().size());
        assertEquals(1, result.warnings().size());
        assertEquals(1L, result.transactions().get(0).categoryId());
    }

    @Test
    void rejectsEmptyFile() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.ofx", "application/x-ofx", new byte[0]);

        assertThrows(IllegalArgumentException.class, () -> service.importFile(file));
        assertThrows(IllegalArgumentException.class, () -> service.importFile(null));
    }

    private static MockMultipartFile multipart(String ofx) {
        return new MockMultipartFile(
                "file",
                "statement.ofx",
                "application/x-ofx",
                ofx.getBytes(StandardCharsets.UTF_8));
    }
}
