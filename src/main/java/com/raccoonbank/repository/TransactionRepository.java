package com.raccoonbank.repository;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Repository;

import com.raccoonbank.config.RaccoonbankProperties;
import com.raccoonbank.csv.AbstractCsvRepository;
import com.raccoonbank.domain.Transaction;

@Repository
public class TransactionRepository extends AbstractCsvRepository<Transaction> {

    private static final List<String> HEADER = List.of(
            "Id", "Category_Id", "PaymentType", "Amount", "BankDate",
            "RealDate", "Title", "Description", "Bill_Id");

    public TransactionRepository(RaccoonbankProperties properties) {
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
                billId(row, 8));
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
                nullToEmpty(value.billId()));
    }

    /**
     * Bill identifiers used to be integers and {@code 0} meant "no bill". They
     * are now free-form strings, so the old sentinel is read as blank.
     */
    private static String billId(List<String> row, int index) {
        String value = text(row, index);
        return "0".equals(value) ? "" : value;
    }

    private static String formatAmount(BigDecimal amount) {
        return amount == null ? "" : amount.toPlainString();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
