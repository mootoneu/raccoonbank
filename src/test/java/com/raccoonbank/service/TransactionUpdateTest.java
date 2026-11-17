package com.raccoonbank.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.raccoonbank.config.RaccoonbankProperties;
import com.raccoonbank.domain.Category;
import com.raccoonbank.domain.Transaction;
import com.raccoonbank.repository.CategoryRepository;
import com.raccoonbank.repository.TransactionRepository;

class TransactionUpdateTest {

    @TempDir
    Path tempDir;

    private TransactionRepository transactionRepository;
    private TransactionService service;

    @BeforeEach
    void setUp() {
        RaccoonbankProperties properties = new RaccoonbankProperties(tempDir.toString());
        CategoryRepository categoryRepository = new CategoryRepository(properties);
        categoryRepository.appendAll(List.of(
                new Category(10, 0, 10, "Groceries", "Groceries", "#2E7D32"),
                new Category(20, 0, 20, "Income", "Income", "#1B5E20")));
        transactionRepository = new TransactionRepository(properties);
        transactionRepository.appendAll(List.of(
                new Transaction(1, 10, "CARD", new BigDecimal("-12.50"),
                        LocalDate.of(2026, 1, 3), LocalDate.of(2026, 1, 4),
                        "CARREFOUR, PARIS", "old note", "B1"),
                new Transaction(2, 0, "DEBIT", new BigDecimal("-3.00"),
                        LocalDate.of(2026, 1, 5), LocalDate.of(2026, 1, 5),
                        "BANK FEE", "", "")));
        service = new TransactionService(transactionRepository, categoryRepository);
    }

    @Test
    void updatesOnlyTheCategoryAndDescription() {
        Transaction updated = service.updateTransaction(1, 20, "  Refund  ");

        assertEquals(new Transaction(1, 20, "CARD", new BigDecimal("-12.50"),
                LocalDate.of(2026, 1, 3), LocalDate.of(2026, 1, 4),
                "CARREFOUR, PARIS", "Refund", "B1"), updated);
        assertEquals(updated, transactionRepository.findAll().get(0));
        assertEquals(new Transaction(2, 0, "DEBIT", new BigDecimal("-3.00"),
                LocalDate.of(2026, 1, 5), LocalDate.of(2026, 1, 5),
                "BANK FEE", "", ""), transactionRepository.findAll().get(1));
    }

    @Test
    void updatesTheReferenceAndKeepsItWhenNotGiven() {
        Transaction updated = service.updateTransaction(1, 10, "old note", " REF-42 ");

        assertEquals("REF-42", updated.billId());
        assertEquals("REF-42", transactionRepository.findAll().get(0).billId());
        assertEquals("REF-42", service.updateTransaction(1, 10, "old note", null).billId());
    }

    @Test
    void allowsUncategorizedAndAnEmptyDescription() {
        Transaction updated = service.updateTransaction(1, 0, null);

        assertEquals(0L, updated.categoryId());
        assertEquals("", updated.description());
    }

    @Test
    void setsTheCategoryOfSeveralTransactionsAtOnce() {
        int updated = service.updateCategory(List.of(1L, 2L), 20);

        assertEquals(2, updated);
        assertEquals(20L, transactionRepository.findAll().get(0).categoryId());
        assertEquals(20L, transactionRepository.findAll().get(1).categoryId());
        assertEquals("old note", transactionRepository.findAll().get(0).description());
    }

    @Test
    void writesNothingWhenAnyIdIsUnknown() {
        assertThrows(IllegalArgumentException.class, () -> service.updateCategory(List.of(1L, 42L), 20));

        assertEquals(10L, transactionRepository.findAll().get(0).categoryId());
    }

    @Test
    void rejectsUnknownCategoriesAndTransactions() {
        assertThrows(IllegalArgumentException.class, () -> service.updateTransaction(1, 99, ""));
        assertThrows(IllegalArgumentException.class, () -> service.updateTransaction(1, -1, ""));
        assertThrows(IllegalArgumentException.class, () -> service.updateTransaction(42, 10, ""));
    }
}
