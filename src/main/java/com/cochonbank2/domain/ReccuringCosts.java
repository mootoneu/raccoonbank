package com.cochonbank2.domain;

import java.math.BigDecimal;

/**
 * An expected recurring cost, stored in reccuringcosts.csv.
 *
 * <p>The title identifies the cost: the spent amount shown by the UI is the sum
 * of the current month's transactions whose title matches it.</p>
 *
 * @param day        typical day of the month on which the cost occurs
 * @param title      title used to match saved transactions
 * @param amount     expected amount
 * @param categoryId reference to the expected category in categories.csv
 */
public record ReccuringCosts(
        int day,
        String title,
        BigDecimal amount,
        long categoryId) {
}
