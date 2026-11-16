package com.cochonbank2.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A one-off spending the user plans to make, stored in panned_spending.csv.
 *
 * @param dueDate    optional date on which the spending is due
 * @param title      title of the planned transaction
 * @param amount     expected amount
 * @param categoryId optional reference to a category in categories.csv
 */
public record PlannedSpending(
        LocalDate dueDate,
        String title,
        BigDecimal amount,
        Long categoryId) {
}
