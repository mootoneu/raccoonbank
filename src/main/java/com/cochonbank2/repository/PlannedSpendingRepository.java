package com.cochonbank2.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Repository;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.csv.AbstractCsvRepository;
import com.cochonbank2.csv.CsvException;
import com.cochonbank2.domain.PlannedSpending;

@Repository
public class PlannedSpendingRepository extends AbstractCsvRepository<PlannedSpending> {

    private static final List<String> HEADER = List.of(
            "DueDate", "Title", "Amount", "Category_Id");

    public PlannedSpendingRepository(CochonbankProperties properties) {
        super(properties.dataPath(), "panned_spending.csv", HEADER);
    }

    @Override
    protected PlannedSpending fromRow(List<String> row) {
        return new PlannedSpending(
                optionalDate(row, 0, "DueDate"),
                requiredText(row, 1, "Title"),
                requiredDecimal(row, 2, "Amount"),
                optionalCategory(row, 3));
    }

    @Override
    protected List<String> toRow(PlannedSpending value) {
        return List.of(
                value.dueDate() == null ? "" : value.dueDate().toString(),
                value.title(),
                value.amount() == null ? "" : value.amount().toPlainString(),
                value.categoryId() == null ? "" : Long.toString(value.categoryId()));
    }

    private static Long optionalCategory(List<String> row, int index) {
        String value = text(row, index);
        if (value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            throw new CsvException("Category_Id is not a valid integer: '" + value + "'");
        }
    }
}
