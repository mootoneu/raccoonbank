package com.cochonbank2.web;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.cochonbank2.domain.PlannedSpending;
import com.cochonbank2.service.PlannedSpendingService;
import com.cochonbank2.service.PlannedSpendingService.Entry;

@RestController
@RequestMapping("/api/planned-spending")
public class PlannedSpendingController {

    private final PlannedSpendingService service;

    public PlannedSpendingController(PlannedSpendingService service) {
        this.service = service;
    }

    @GetMapping
    public List<PlannedSpendingResponse> findAll() {
        return service.findAll().stream().map(PlannedSpendingController::response).toList();
    }

    @PostMapping
    public ResponseEntity<PlannedSpendingResponse> create(@RequestBody PlannedSpendingRequest request) {
        Entry created = service.create(
                request.dueDate(), request.title(), request.amount(), request.categoryId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response(created));
    }

    @PutMapping
    public PlannedSpendingResponse update(
            @RequestParam("index") int index,
            @RequestBody PlannedSpendingRequest request) {
        return response(service.update(
                index, request.dueDate(), request.title(), request.amount(), request.categoryId()));
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@RequestParam("index") int index) {
        service.delete(index);
        return ResponseEntity.noContent().build();
    }

    private static PlannedSpendingResponse response(Entry entry) {
        PlannedSpending spending = entry.spending();
        return new PlannedSpendingResponse(
                entry.index(), spending.dueDate(), spending.title(),
                spending.amount(), spending.categoryId());
    }

    public record PlannedSpendingRequest(
            LocalDate dueDate,
            String title,
            BigDecimal amount,
            Long categoryId) {
    }

    public record PlannedSpendingResponse(
            int index,
            LocalDate dueDate,
            String title,
            BigDecimal amount,
            Long categoryId) {
    }
}
