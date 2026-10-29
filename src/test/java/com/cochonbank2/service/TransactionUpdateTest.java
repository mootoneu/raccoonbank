package com.cochonbank2.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.Transaction;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.TransactionRepository;

class TransactionUpdateTest {

    @TempDir
    Path tempDir;

    private TransactionRepository transactionRepository;
    private TransactionService service;

    @BeforeEach
    void setUp() {
        CochonbankProperties properties = new CochonbankProperties(tempDir.toString());
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
    void allowsUncategorizedAndAnEmptyDescription() {
        Transaction updated = service.updateTransaction(1, 0, null);

        assertEquals(0L, updated.categoryId());
        assertEquals("", updated.description());
    }

    @Test
    void rejectsUnknownCategoriesAndTransactions() {
        assertThrows(IllegalArgumentException.class, () -> service.updateTransaction(1, 99, ""));
        assertThrows(IllegalArgumentException.class, () -> service.updateTransaction(1, -1, ""));
        assertThrows(IllegalArgumentException.class, () -> service.updateTransaction(42, 10, ""));
    }
}
