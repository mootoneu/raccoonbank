package com.raccoonbank.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A saved transaction, stored in transactions.csv.
 */
public record Transaction(
        long id,
        long categoryId,
        String paymentType,
        BigDecimal amount,
        LocalDate bankDate,
        LocalDate realDate,
        String title,
        String description,
        String billId) {
}
