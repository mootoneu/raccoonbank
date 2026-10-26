package com.cochonbank2.service;

import java.util.List;

import com.cochonbank2.domain.TransactionDraft;

/**
 * Preview returned by the import endpoint.
 */
public record OfxImportResult(
        String fileName,
        List<TransactionDraft> transactions,
        List<String> warnings) {
}
