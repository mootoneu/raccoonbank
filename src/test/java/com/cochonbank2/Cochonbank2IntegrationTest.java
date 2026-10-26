package com.cochonbank2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class Cochonbank2IntegrationTest {

    private static final Path DATA_DIR = createTempDirectory();

    @DynamicPropertySource
    static void dataDirectory(DynamicPropertyRegistry registry) {
        registry.add("cochonbank.data-directory", DATA_DIR::toString);
    }

    @Autowired
    private Environment environment;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private HttpClient client;
    private String baseUrl;

    @BeforeEach
    void setUp() {
        client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        baseUrl = "http://localhost:" + environment.getProperty("local.server.port");
    }

    @AfterAll
    static void cleanUp() throws IOException {
        if (!Files.exists(DATA_DIR)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(DATA_DIR)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    @Test
    void servesTheFrontendAndItsVendoredLibraries() throws Exception {
        HttpResponse<String> home = get("/");
        assertEquals(200, home.statusCode());
        assertTrue(home.body().contains("CochonBank2"));
        assertTrue(home.body().contains("/js/app.js"));
        assertTrue(home.body().contains("/vendor/jquery-3.7.1.min.js"));
        assertTrue(home.body().contains("/vendor/d3-7.9.0.min.js"));

        assertEquals(200, get("/css/app.css").statusCode());
        assertEquals(200, get("/js/app.js").statusCode());
        HttpResponse<String> d3 = get("/vendor/d3-7.9.0.min.js");
        assertEquals(200, d3.statusCode());
        assertTrue(d3.body().length() > 100_000);
    }

    @Test
    void importsReviewsAndSavesTransactionsThroughTheRestApi() throws Exception {
        JsonNode categories = json(get("/api/categories"));
        assertTrue(categories.size() >= 11);
        assertEquals("Groceries", byName(categories, "Groceries").get("name").asText());
        assertEquals("#2E7D32", byName(categories, "Groceries").get("color").asText());

        JsonNode defaults = json(get("/api/default-categories"));
        assertTrue(defaults.size() >= 1);

        String boundary = "----CochonBank2" + UUID.randomUUID();
        HttpRequest importRequest = HttpRequest.newBuilder(URI.create(baseUrl + "/api/transactions/import"))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(
                        multipartBody(boundary, "sample.ofx", resource("/ofx/sample.ofx"))))
                .build();
        HttpResponse<String> importResponse = client.send(importRequest, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, importResponse.statusCode(), importResponse.body());

        JsonNode preview = json(importResponse);
        assertEquals("sample.ofx", preview.get("fileName").asText());
        JsonNode transactions = preview.get("transactions");
        assertEquals(5, transactions.size());

        JsonNode carrefour = byTitle(transactions, "CARREFOUR MARKET");
        assertEquals(1, carrefour.get("categoryId").asLong());
        assertEquals("DEBIT", carrefour.get("paymentType").asText());
        assertEquals("-42.15", carrefour.get("amount").decimalValue().toPlainString());
        assertEquals("2026-10-13", carrefour.get("bankDate").asText());
        assertEquals("2026-10-12", carrefour.get("realDate").asText());

        JsonNode salary = byTitle(transactions, "SALAIRE OCTOBRE");
        assertEquals(9, salary.get("categoryId").asLong());

        JsonNode transfer = byTitle(transactions, "VIREMENT PONT");
        assertEquals(0, transfer.get("categoryId").asLong());

        HttpRequest saveRequest = HttpRequest.newBuilder(URI.create(baseUrl + "/api/transactions"))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(transactions.toString(), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> saveResponse = client.send(saveRequest, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, saveResponse.statusCode(), saveResponse.body());
        assertEquals(5, json(saveResponse).get("saved").asInt());

        JsonNode saved = json(get("/api/transactions"));
        assertEquals(5, saved.size());
        assertEquals("VIREMENT PONT", saved.get(0).get("title").asText(),
                "transactions are returned newest first");

        List<String> lines = Files.readAllLines(DATA_DIR.resolve("transactions.csv"), StandardCharsets.UTF_8);
        assertEquals(6, lines.size());
        assertEquals("Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id",
                lines.get(0));
        assertTrue(lines.get(1).startsWith("1,1,DEBIT,-42.15,2026-10-13,2026-10-12,CARREFOUR MARKET,,"));
    }

    @Test
    void rejectsInvalidTransactionsWithAProblemDetail() throws Exception {
        String body = """
                [{"categoryId":1,"paymentType":"DEBIT","amount":-5.00,"title":"NO DATE"}]
                """;
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/transactions"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(400, response.statusCode());
        JsonNode problem = json(response);
        assertNotNull(problem.get("detail"));
        assertTrue(problem.get("detail").asText().contains("bank date"));
    }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode json(HttpResponse<String> response) {
        return objectMapper.readTree(response.body());
    }

    private static JsonNode byName(JsonNode categories, String name) {
        for (JsonNode category : categories) {
            if (name.equals(category.get("name").asText())) {
                return category;
            }
        }
        throw new AssertionError("Category not found: " + name);
    }

    private static JsonNode byTitle(JsonNode transactions, String title) {
        for (JsonNode transaction : transactions) {
            if (title.equals(transaction.get("title").asText())) {
                return transaction;
            }
        }
        throw new AssertionError("Transaction not found: " + title);
    }

    private static byte[] resource(String path) throws IOException {
        try (InputStream input = Cochonbank2IntegrationTest.class.getResourceAsStream(path)) {
            if (input == null) {
                throw new IOException("Missing test resource " + path);
            }
            return input.readAllBytes();
        }
    }

    private static byte[] multipartBody(String boundary, String fileName, byte[] content) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\n")
                .getBytes(StandardCharsets.UTF_8));
        body.write("Content-Type: application/x-ofx\r\n\r\n".getBytes(StandardCharsets.UTF_8));
        body.write(content);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return body.toByteArray();
    }

    private static Path createTempDirectory() {
        try {
            return Files.createTempDirectory("cochonbank2-test-");
        } catch (IOException ex) {
            throw new IllegalStateException("Could not create test data directory", ex);
        }
    }
}
