package com.raccoonbank.ofx;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Raw information extracted from one OFX {@code STMTTRN} block.
 */
public record OfxStatement(
        String transactionType,
        LocalDate bankDate,
        BigDecimal amount,
        String name,
        String memo) {
}
