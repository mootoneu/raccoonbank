package com.cochonbank2.repository;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.csv.AbstractCsvRepository;
import com.cochonbank2.domain.DefaultCategory;

@Repository
public class DefaultCategoryRepository extends AbstractCsvRepository<DefaultCategory> {

    private static final List<String> HEADER = List.of("Id", "Category_Id", "Pattern");

    public DefaultCategoryRepository(CochonbankProperties properties) {
        super(properties.dataPath(), "defaultcategories.csv", HEADER);
    }

    @Override
    protected DefaultCategory fromRow(List<String> row) {
        return new DefaultCategory(
                requiredLong(row, 0, "Id"),
                requiredLong(row, 1, "Category_Id"),
                requiredText(row, 2, "Pattern"));
    }

    @Override
    protected List<String> toRow(DefaultCategory value) {
        return List.of(
                Long.toString(value.id()),
                Long.toString(value.categoryId()),
                value.pattern());
    }
}
