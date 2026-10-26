package com.cochonbank2.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DataBackupServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void keepsOnlyTheThreeMostRecentSnapshots() throws IOException {
        DataBackupService service = new DataBackupService(
                new CochonbankProperties(tempDir.toString()));
        writeDataFiles("v1");

        Optional<Path> first = service.backupOnStartup();
        assertTrue(first.isPresent());
        assertEquals("v1", Files.readString(first.orElseThrow().resolve("transactions.csv")));
        assertEquals("v1", Files.readString(first.orElseThrow().resolve("categories.csv")));
        assertEquals("v1", Files.readString(first.orElseThrow().resolve("defaultcategories.csv")));

        for (int version = 2; version <= 5; version++) {
            writeDataFiles("v" + version);
            assertTrue(service.backupOnStartup().isPresent());
        }

        List<Path> snapshots = snapshots();
        assertEquals(DataBackupService.RETAINED_BACKUPS, snapshots.size());
        assertEquals(List.of("v3", "v4", "v5"),
                snapshots.stream()
                        .map(path -> readQuietly(path.resolve("transactions.csv")))
                        .toList());

        for (Path snapshot : snapshots) {
            assertEquals(3, countFiles(snapshot));
        }
    }

    @Test
    void doesNothingWhenThereIsNoDataFileYet() throws IOException {
        DataBackupService service = new DataBackupService(
                new CochonbankProperties(tempDir.toString()));

        assertTrue(service.backupOnStartup().isEmpty());
        assertFalse(Files.exists(tempDir.resolve(DataBackupService.BACKUP_DIRECTORY)));
    }

    @Test
    void backsUpOnlyTheFilesThatExist() throws IOException {
        Files.writeString(tempDir.resolve("transactions.csv"), "only-transactions");
        DataBackupService service = new DataBackupService(
                new CochonbankProperties(tempDir.toString()));

        Path snapshot = service.backupOnStartup().orElseThrow();

        assertEquals(1, countFiles(snapshot));
        assertEquals("only-transactions", Files.readString(snapshot.resolve("transactions.csv")));
        assertFalse(Files.exists(snapshot.resolve("categories.csv")));
    }

    @Test
    void leavesUnrelatedDirectoriesAloneWhenPruning() throws IOException {
        DataBackupService service = new DataBackupService(
                new CochonbankProperties(tempDir.toString()));
        Path unrelated = tempDir.resolve(DataBackupService.BACKUP_DIRECTORY).resolve("notes");
        Files.createDirectories(unrelated);

        for (int version = 1; version <= 5; version++) {
            writeDataFiles("v" + version);
            service.backupOnStartup();
        }

        assertTrue(Files.isDirectory(unrelated));
        assertEquals(DataBackupService.RETAINED_BACKUPS, snapshots().size());
    }

    private void writeDataFiles(String content) throws IOException {
        Files.writeString(tempDir.resolve("transactions.csv"), content);
        Files.writeString(tempDir.resolve("categories.csv"), content);
        Files.writeString(tempDir.resolve("defaultcategories.csv"), content);
    }

    private List<Path> snapshots() throws IOException {
        try (Stream<Path> paths = Files.list(
                tempDir.resolve(DataBackupService.BACKUP_DIRECTORY))) {
            return paths
                    .filter(Files::isDirectory)
                    .filter(path -> path.getFileName().toString().startsWith("backup-"))
                    .sorted()
                    .toList();
        }
    }

    private static long countFiles(Path directory) throws IOException {
        try (Stream<Path> paths = Files.list(directory)) {
            return paths.filter(Files::isRegularFile).count();
        }
    }

    private static String readQuietly(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
