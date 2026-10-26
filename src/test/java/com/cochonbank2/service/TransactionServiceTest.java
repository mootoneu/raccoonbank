package com.cochonbank2.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.Transaction;
import com.cochonbank2.domain.TransactionDraft;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.TransactionRepository;

class TransactionServiceTest {

    @TempDir
    Path tempDir;

    private TransactionRepository transactionRepository;
    private TransactionService service;

    @BeforeEach
    void setUp() {
        CochonbankProperties properties = new CochonbankProperties(tempDir.toString());
        CategoryRepository categoryRepository = new CategoryRepository(properties);
        categoryRepository.appendAll(List.of(
                new Category(1, "Groceries", "#2E7D32"),
                new Category(2, "Income", "#1B5E20")));
        transactionRepository = new TransactionRepository(properties);
        service = new TransactionService(transactionRepository, categoryRepository);
    }

    @Test
    void appendsDraftsWithSequentialIdsAndKeepsCsvFormat() throws Exception {
        int saved = service.saveAll(List.of(
                draft(1L, "DEBIT", "-12.30", LocalDate.of(2026, 10, 1),
                        LocalDate.of(2026, 9, 30), "LIDL", "weekly shop", "42"),
                draft(null, "CREDIT", "1000.00", LocalDate.of(2026, 9, 30),
                        null, "SALARY", null, null)));

        assertEquals(2, saved);
        List<Transaction> transactions = service.findAll();
        assertEquals(2, transactions.size());
        assertEquals(LocalDate.of(2026, 10, 1), transactions.get(0).bankDate());
        assertEquals(1L, transactions.get(0).id());
        assertEquals("42", transactions.get(0).billId());
        assertEquals(2L, transactions.get(1).id());
        assertEquals(0L, transactions.get(1).categoryId());
        assertEquals("", transactions.get(1).billId());
        assertEquals(LocalDate.of(2026, 9, 30), transactions.get(1).realDate(),
                "a missing real date falls back to the bank date");

        Path csv = tempDir.resolve("transactions.csv");
        List<String> lines = Files.readAllLines(csv, StandardCharsets.UTF_8);
        assertEquals(3, lines.size());
        assertEquals("Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id",
                lines.get(0));
        assertEquals("1,1,DEBIT,-12.30,2026-10-01,2026-09-30,LIDL,weekly shop,42", lines.get(1));
        assertEquals("2,0,CREDIT,1000.00,2026-09-30,2026-09-30,SALARY,,", lines.get(2));

        service.saveAll(List.of(
                draft(1L, "DEBIT", "-1.00", LocalDate.of(2026, 10, 2),
                        null, "ALDI", "", "INV-2026-01")));

        List<Transaction> afterSecondSave = service.findAll();
        assertEquals(3, afterSecondSave.size());
        assertEquals(3L, afterSecondSave.get(0).id());
        assertEquals("INV-2026-01", afterSecondSave.get(0).billId());
        assertEquals(LocalDate.of(2026, 10, 2), afterSecondSave.get(0).realDate());
        assertTrue(Files.readAllLines(csv).get(3)
                .startsWith("3,1,DEBIT,-1.00,2026-10-02,2026-10-02,ALDI,,INV-2026-01"));
    }

    @Test
    void rejectsUnknownCategoryAndMissingRequiredFields() {
        IllegalArgumentException unknownCategory = assertThrows(IllegalArgumentException.class,
                () -> service.saveAll(List.of(
                        draft(99L, "DEBIT", "-1.00", LocalDate.of(2026, 10, 1),
                                null, "TITLE", "", "1"))));
        assertTrue(unknownCategory.getMessage().contains("unknown category"));

        IllegalArgumentException missingAmount = assertThrows(IllegalArgumentException.class,
                () -> service.saveAll(List.of(
                        new TransactionDraft(0L, "DEBIT", null, LocalDate.of(2026, 10, 1),
                                null, "TITLE", "", ""))));
        assertTrue(missingAmount.getMessage().contains("amount"));

        IllegalArgumentException missingDate = assertThrows(IllegalArgumentException.class,
                () -> service.saveAll(List.of(
                        new TransactionDraft(0L, "DEBIT", BigDecimal.ONE, null,
                                null, "TITLE", "", ""))));
        assertTrue(missingDate.getMessage().contains("bank date"));

        IllegalArgumentException missingTitle = assertThrows(IllegalArgumentException.class,
                () -> service.saveAll(List.of(
                        new TransactionDraft(0L, "DEBIT", BigDecimal.ONE, LocalDate.of(2026, 10, 1),
                                null, "   ", "", ""))));
        assertTrue(missingTitle.getMessage().contains("title"));

        assertTrue(service.findAll().isEmpty(), "nothing should have been written");
    }

    @Test
    void trimsTextAndKeepsBillIdAsAString() {
        service.saveAll(List.of(
                new TransactionDraft(1L, "  DEBIT ", new BigDecimal("1.5"), LocalDate.of(2026, 10, 1),
                        null, "  MY TITLE  ", "  a note  ", "  INV-9  "),
                new TransactionDraft(1L, "DEBIT", new BigDecimal("-2"), LocalDate.of(2026, 10, 2),
                        LocalDate.of(2026, 10, 1), "OTHER", "", "   "),
                new TransactionDraft(1L, "DEBIT", new BigDecimal("-3"), LocalDate.of(2026, 10, 3),
                        null, "NO BILL", null, null)));

        List<Transaction> transactions = service.findAll();
        Transaction marked = transactions.stream()
                .filter(transaction -> "MY TITLE".equals(transaction.title()))
                .findFirst()
                .orElseThrow();
        assertEquals("DEBIT", marked.paymentType());
        assertEquals("a note", marked.description());
        assertEquals("INV-9", marked.billId());
        assertEquals(new BigDecimal("1.5"), marked.amount());

        Transaction blank = transactions.stream()
                .filter(transaction -> "OTHER".equals(transaction.title()))
                .findFirst()
                .orElseThrow();
        assertEquals("", blank.billId());
        assertEquals(LocalDate.of(2026, 10, 1), blank.realDate());

        Transaction missing = transactions.stream()
                .filter(transaction -> "NO BILL".equals(transaction.title()))
                .findFirst()
                .orElseThrow();
        assertEquals("", missing.billId());
        assertEquals(LocalDate.of(2026, 10, 3), missing.realDate());
    }

    @Test
    void emptyBatchWritesNothing() {
        assertEquals(0, service.saveAll(List.of()));
        assertEquals(0, service.saveAll(null));
        assertTrue(service.findAll().isEmpty());
    }

    @Test
    void readsLegacyZeroBillIdAsBlank() throws Exception {
        Files.writeString(tempDir.resolve("transactions.csv"),
                "Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id\n"
                        + "1,1,DEBIT,-42.15,2026-10-13,2026-10-12,LIDL,,0\n");

        Transaction transaction = service.findAll().get(0);
        assertEquals("", transaction.billId());
    }

    private static TransactionDraft draft(
            Long categoryId,
            String paymentType,
            String amount,
            LocalDate bankDate,
            LocalDate realDate,
            String title,
            String description,
            String billId) {
        return new TransactionDraft(
                categoryId,
                paymentType,
                new BigDecimal(amount),
                bankDate,
                realDate,
                title,
                description,
                billId);
    }
}
