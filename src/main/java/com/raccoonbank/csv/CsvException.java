package com.raccoonbank.csv;

/**
 * Raised when a CSV file cannot be read or does not match the expected format.
 */
public class CsvException extends RuntimeException {

    public CsvException(String message) {
        super(message);
    }

    public CsvException(String message, Throwable cause) {
        super(message, cause);
    }
}
