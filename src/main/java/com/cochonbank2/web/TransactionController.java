package com.cochonbank2.web;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.cochonbank2.domain.Transaction;
import com.cochonbank2.domain.TransactionDraft;
import com.cochonbank2.service.OfxImportResult;
import com.cochonbank2.service.OfxImportService;
import com.cochonbank2.service.TransactionService;

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

    public record SaveTransactionsResponse(int saved) {
    }
}
