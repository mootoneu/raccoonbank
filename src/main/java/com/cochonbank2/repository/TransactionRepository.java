package com.cochonbank2.repository;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Repository;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.csv.AbstractCsvRepository;
import com.cochonbank2.domain.Transaction;

@Repository
public class TransactionRepository extends AbstractCsvRepository<Transaction> {

    private static final List<String> HEADER = List.of(
            "Id", "Category_Id", "PaymentType", "Amount", "BankDate",
            "RealDate", "Title", "Description", "Bill_Id");

    public TransactionRepository(CochonbankProperties properties) {
        super(properties.dataPath(), "transactions.csv", HEADER);
    }

    @Override
    protected Transaction fromRow(List<String> row) {
        return new Transaction(
                requiredLong(row, 0, "Id"),
                optionalLong(row, 1, 0),
                text(row, 2),
                requiredDecimal(row, 3, "Amount"),
                optionalDate(row, 4, "BankDate"),
                optionalDate(row, 5, "RealDate"),
                text(row, 6),
                text(row, 7),
                optionalLong(row, 8, 0));
    }

    @Override
    protected List<String> toRow(Transaction value) {
        return List.of(
                Long.toString(value.id()),
                Long.toString(value.categoryId()),
                nullToEmpty(value.paymentType()),
                formatAmount(value.amount()),
                value.bankDate() == null ? "" : value.bankDate().toString(),
                value.realDate() == null ? "" : value.realDate().toString(),
                nullToEmpty(value.title()),
                nullToEmpty(value.description()),
                Long.toString(value.billId()));
    }

    private static String formatAmount(BigDecimal amount) {
        return amount == null ? "" : amount.toPlainString();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
