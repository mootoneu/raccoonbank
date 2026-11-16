package com.cochonbank2.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Copies the CSV data files into timestamped snapshots before the application
 * starts and keeps only the three most recent snapshots.
 */
@Component
public class DataBackupService {

    static final int RETAINED_BACKUPS = 3;
    static final String BACKUP_DIRECTORY = "backup";

    private static final Logger log = LoggerFactory.getLogger(DataBackupService.class);
    private static final List<String> DATA_FILES = List.of(
            "transactions.csv", "categories.csv", "defaultcategories.csv", "reccuringcosts.csv");
    private static final DateTimeFormatter SNAPSHOT_STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS");
    private static final Pattern SNAPSHOT_NAME =
            Pattern.compile("^backup-\\d{8}-\\d{6}-\\d{3}(?:-\\d+)?$");

    private final CochonbankProperties properties;

    public DataBackupService(CochonbankProperties properties) {
        this.properties = properties;
    }

    /**
     * Backs up the data directory configured for this application.
     *
     * @return the snapshot directory, or empty when no data file exists yet
     */
    public Optional<Path> backupOnStartup() throws IOException {
        return backup(properties.dataPath());
    }

    /**
     * Takes a snapshot of the data directory before a bulk rewrite of the files.
     */
    public Optional<Path> backupBeforeChange() throws IOException {
        return backup(properties.dataPath());
    }

    Optional<Path> backup(Path dataDirectory) throws IOException {
        List<String> existing = DATA_FILES.stream()
                .filter(fileName -> Files.isRegularFile(dataDirectory.resolve(fileName)))
                .toList();
        if (existing.isEmpty()) {
            log.info("No data files to back up in {}", dataDirectory);
            return Optional.empty();
        }

        Path backupRoot = dataDirectory.resolve(BACKUP_DIRECTORY);
        Files.createDirectories(backupRoot);
        Path snapshot = createSnapshotDirectory(backupRoot);

        try {
            for (String fileName : existing) {
                Files.copy(
                        dataDirectory.resolve(fileName),
                        snapshot.resolve(fileName),
                        StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ex) {
            deleteRecursively(snapshot);
            throw new IOException("Cannot back up " + dataDirectory + " to " + snapshot, ex);
        }

        log.info("Data backup created: {} ({} files)", snapshot, existing.size());
        try {
            prune(backupRoot);
        } catch (IOException ex) {
            log.warn("Could not prune old data backups in {}", backupRoot, ex);
        }
        return Optional.of(snapshot);
    }

    private static Path createSnapshotDirectory(Path backupRoot) throws IOException {
        String base = "backup-" + LocalDateTime.now().format(SNAPSHOT_STAMP);
        Path snapshot = backupRoot.resolve(base);
        int suffix = 2;
        while (Files.exists(snapshot)) {
            snapshot = backupRoot.resolve(base + "-" + suffix++);
        }
        return Files.createDirectory(snapshot);
    }

    private static void prune(Path backupRoot) throws IOException {
        List<Path> snapshots;
        try (Stream<Path> paths = Files.list(backupRoot)) {
            snapshots = paths
                    .filter(Files::isDirectory)
                    .filter(path -> SNAPSHOT_NAME.matcher(path.getFileName().toString()).matches())
                    .sorted(Comparator.comparing(
                            (Path path) -> path.getFileName().toString()).reversed())
                    .toList();
        }

        for (int index = RETAINED_BACKUPS; index < snapshots.size(); index++) {
            Path old = snapshots.get(index);
            try {
                deleteRecursively(old);
                log.info("Removed old data backup {}", old);
            } catch (IOException ex) {
                log.warn("Could not remove old data backup {}", old, ex);
            }
        }
    }

    private static void deleteRecursively(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}
