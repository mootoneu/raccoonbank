package com.cochonbank2.web;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.cochonbank2.domain.ReccuringCosts;
import com.cochonbank2.service.ReccuringCostsService;

@RestController
@RequestMapping("/api/reccuring-costs")
public class ReccuringCostsController {

    private final ReccuringCostsService service;

    public ReccuringCostsController(ReccuringCostsService service) {
        this.service = service;
    }

    @GetMapping
    public List<ReccuringCosts> findAll() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<ReccuringCosts> create(@RequestBody ReccuringCostsRequest request) {
        ReccuringCosts created = service.create(
                request.day(), request.title(), request.amount(), request.categoryId());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{title}")
    public ReccuringCosts update(
            @PathVariable("title") String title,
            @RequestBody ReccuringCostsRequest request) {
        return service.update(
                title, request.day(), request.title(), request.amount(), request.categoryId());
    }

    /**
     * Same as {@link #update(String, ReccuringCostsRequest)}, but takes the
     * current title from the query string so titles containing slashes work.
     */
    @PutMapping
    public ReccuringCosts updateByQuery(
            @RequestParam("title") String title,
            @RequestBody ReccuringCostsRequest request) {
        return service.update(
                title, request.day(), request.title(), request.amount(), request.categoryId());
    }

    @DeleteMapping("/{title}")
    public ResponseEntity<Void> delete(@PathVariable("title") String title) {
        service.delete(title);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> deleteByQuery(@RequestParam("title") String title) {
        service.delete(title);
        return ResponseEntity.noContent().build();
    }

    public record ReccuringCostsRequest(
            int day,
            String title,
            BigDecimal amount,
            Long categoryId) {
    }
}
