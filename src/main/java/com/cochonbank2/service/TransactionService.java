package com.cochonbank2.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
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

            transactions.add(new Transaction(
                    nextId++,
                    categoryId,
                    trimToEmpty(draft.paymentType()),
                    amount,
                    draft.bankDate(),
                    draft.realDate(),
                    title,
                    trimToEmpty(draft.description()),
                    draft.billId() == null ? 0L : draft.billId()));
        }

        transactionRepository.appendAll(transactions);
        return transactions.size();
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
