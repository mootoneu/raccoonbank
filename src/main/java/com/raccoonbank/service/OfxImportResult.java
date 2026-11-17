package com.raccoonbank.service;

import java.util.List;

import com.raccoonbank.domain.TransactionDraft;

/**
 * Preview returned by the import endpoint.
 */
public record OfxImportResult(
        String fileName,
        List<TransactionDraft> transactions,
        List<String> warnings) {
}
