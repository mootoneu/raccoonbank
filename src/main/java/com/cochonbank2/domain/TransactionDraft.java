package com.cochonbank2.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * An unsaved transaction. Used both for the OFX import preview and for the
 * batch save endpoint. The identifier is assigned by the backend on save.
 */
public record TransactionDraft(
        Long categoryId,
        String paymentType,
        BigDecimal amount,
        LocalDate bankDate,
        LocalDate realDate,
        String title,
        String description,
        Long billId) {
}
