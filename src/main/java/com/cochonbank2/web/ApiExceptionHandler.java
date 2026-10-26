package com.cochonbank2.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import com.cochonbank2.csv.CsvException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleBadRequest(IllegalArgumentException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request", ex.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ProblemDetail handleFileTooLarge(MaxUploadSizeExceededException ex) {
        return problem(HttpStatus.CONTENT_TOO_LARGE, "File too large",
                "The OFX file exceeds the 10 MB limit.");
    }

    @ExceptionHandler(CsvException.class)
    public ProblemDetail handleCsvError(CsvException ex) {
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Data file error",
                ex.getMessage() + " Check the CSV files in the data directory.");
    }

    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail handleServerError(IllegalStateException ex) {
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Import failed", ex.getMessage());
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail detailBody = ProblemDetail.forStatusAndDetail(status, detail);
        detailBody.setTitle(title);
        return detailBody;
    }
}
