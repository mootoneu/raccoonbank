package com.raccoonbank.web;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.raccoonbank.domain.Transaction;
import com.raccoonbank.domain.TransactionDraft;
import com.raccoonbank.service.OfxImportResult;
import com.raccoonbank.service.OfxImportService;
import com.raccoonbank.service.TransactionService;

@RestController
@RequestMapping("/api/transactions")
public class TransactionController {

    private final TransactionService transactionService;
    private final OfxImportService importService;

    public TransactionController(
            TransactionService transactionService,
            OfxImportService importService) {
        this.transactionService = transactionService;
        this.importService = importService;
    }

    @GetMapping
    public List<Transaction> findAll() {
        return transactionService.findAll();
    }

    @PostMapping
    public SaveTransactionsResponse saveAll(@RequestBody List<TransactionDraft> drafts) {
        return new SaveTransactionsResponse(transactionService.saveAll(drafts));
    }

    @PostMapping(path = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public OfxImportResult importOfx(@RequestParam("file") MultipartFile file) {
        return importService.importFile(file);
    }

    @PutMapping("/{id}")
    public Transaction update(
            @PathVariable("id") long id,
            @RequestBody UpdateTransactionRequest request) {
        return transactionService.updateTransaction(
                id, request.categoryId(), request.description(), request.billId());
    }

    @PutMapping("/category")
    public BulkUpdateResponse updateCategory(@RequestBody UpdateCategoryRequest request) {
        return new BulkUpdateResponse(transactionService.updateCategory(request.ids(), request.categoryId()));
    }

    public record SaveTransactionsResponse(int saved) {
    }

    public record UpdateCategoryRequest(List<Long> ids, long categoryId) {
    }

    public record BulkUpdateResponse(int updated) {
    }

    /**
     * A {@code null} billId leaves the reference unchanged.
     */
    public record UpdateTransactionRequest(long categoryId, String description, String billId) {
    }
}
