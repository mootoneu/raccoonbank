package com.cochonbank2.repository;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.csv.AbstractCsvRepository;
import com.cochonbank2.domain.ReccuringCosts;

@Repository
public class ReccuringCostsRepository extends AbstractCsvRepository<ReccuringCosts> {

    private static final List<String> HEADER = List.of(
            "Day", "Title", "Amount", "Category_Id");

    public ReccuringCostsRepository(CochonbankProperties properties) {
        super(properties.dataPath(), "reccuringcosts.csv", HEADER);
    }

    @Override
    protected ReccuringCosts fromRow(List<String> row) {
        return new ReccuringCosts(
                (int) requiredLong(row, 0, "Day"),
                requiredText(row, 1, "Title"),
                requiredDecimal(row, 2, "Amount"),
                optionalLong(row, 3, 0));
    }

    @Override
    protected List<String> toRow(ReccuringCosts value) {
        return List.of(
                Integer.toString(value.day()),
                value.title(),
                value.amount() == null ? "" : value.amount().toPlainString(),
                Long.toString(value.categoryId()));
    }
}
