package com.cochonbank2.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.Transaction;
import com.cochonbank2.domain.TransactionDraft;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.TransactionRepository;

@Service
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;

    public TransactionService(
            TransactionRepository transactionRepository,
            CategoryRepository categoryRepository) {
        this.transactionRepository = transactionRepository;
        this.categoryRepository = categoryRepository;
    }

    public List<Transaction> findAll() {
        return transactionRepository.findAll().stream()
                .sorted(Comparator
                        .comparing(Transaction::bankDate, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Transaction::id, Comparator.reverseOrder()))
                .toList();
    }

    /**
     * Validates and appends the drafts to transactions.csv with fresh sequential
     * identifiers. The method is synchronized so two saves cannot allocate the
     * same identifiers.
     */
    public synchronized int saveAll(List<TransactionDraft> drafts) {
        if (drafts == null || drafts.isEmpty()) {
            return 0;
        }

        Set<Long> knownCategories = new HashSet<>();
        for (Category category : categoryRepository.findAll()) {
            knownCategories.add(category.id());
        }

        long nextId = transactionRepository.findAll().stream()
                .mapToLong(Transaction::id)
                .max()
                .orElse(0L) + 1;

        List<Transaction> transactions = new ArrayList<>(drafts.size());
        for (int i = 0; i < drafts.size(); i++) {
            TransactionDraft draft = drafts.get(i);
            String prefix = "Row " + (i + 1) + ": ";
            if (draft == null) {
                throw new IllegalArgumentException(prefix + "transaction is missing.");
            }

            long categoryId = draft.categoryId() == null ? 0L : draft.categoryId();
            if (categoryId < 0) {
                throw new IllegalArgumentException(prefix + "category is invalid.");
            }
            if (categoryId != 0 && !knownCategories.contains(categoryId)) {
                throw new IllegalArgumentException(prefix + "unknown category (id " + categoryId + ").");
            }

            BigDecimal amount = draft.amount();
            if (amount == null) {
                throw new IllegalArgumentException(prefix + "amount is required.");
            }
            if (draft.bankDate() == null) {
                throw new IllegalArgumentException(prefix + "bank date is required.");
            }

            String title = draft.title() == null ? "" : draft.title().trim();
            if (title.isEmpty()) {
                throw new IllegalArgumentException(prefix + "title is required.");
            }

            LocalDate realDate = draft.realDate() == null ? draft.bankDate() : draft.realDate();

            transactions.add(new Transaction(
                    nextId++,
                    categoryId,
                    trimToEmpty(draft.paymentType()),
                    amount,
                    draft.bankDate(),
                    realDate,
                    title,
                    trimToEmpty(draft.description()),
                    trimToEmpty(draft.billId())));
        }

        transactionRepository.appendAll(transactions);
        return transactions.size();
    }

    /**
     * Changes the category and description of a saved transaction. Every other
     * field is kept as stored.
     */
    public synchronized Transaction updateTransaction(long id, long categoryId, String description) {
        if (categoryId < 0) {
            throw new IllegalArgumentException("Category is invalid.");
        }
        if (categoryId != 0 && categoryRepository.findAll().stream()
                .noneMatch(category -> category.id() == categoryId)) {
            throw new IllegalArgumentException("Unknown category (id " + categoryId + ").");
        }
        Transaction existing = transactionRepository.findAll().stream()
                .filter(transaction -> transaction.id() == id)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown transaction (id " + id + ")."));

        String text = trimToEmpty(description);
        transactionRepository.updateRow("Id", id, Map.of(
                "Category_Id", Long.toString(categoryId),
                "Description", text));
        return new Transaction(
                existing.id(),
                categoryId,
                existing.paymentType(),
                existing.amount(),
                existing.bankDate(),
                existing.realDate(),
                existing.title(),
                text,
                existing.billId());
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
