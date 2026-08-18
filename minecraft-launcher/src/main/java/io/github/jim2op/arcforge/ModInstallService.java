package io.github.jim2op.arcforge;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

/** Downloads an explicit provider artifact and records it only after checksum validation. */
public final class ModInstallService {
    private final LauncherStore store;
    private final HttpClient http;
    private final String curseForgeApiKey;

    public ModInstallService(LauncherStore store) throws IOException {
        this(store, store.loadPreferences().curseForgeApiKey(), HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NORMAL).build());
    }

    ModInstallService(LauncherStore store, String curseForgeApiKey, HttpClient http) {
        this.store = Objects.requireNonNull(store, "store");
        this.curseForgeApiKey = Domain.blankToEmpty(curseForgeApiKey);
        this.http = Objects.requireNonNull(http, "http");
    }

    public Path install(Domain.InstanceConfig instance, Domain.ModFile modFile) throws IOException, InterruptedException {
        if (!modFile.downloadable()) {
            throw new IOException("This provider did not supply a direct, authorized download URL for " + modFile.fileName());
        }
        URI uri = URI.create(modFile.downloadUrl());
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IOException("Only HTTPS mod downloads are permitted");
        }
        String filename = LauncherStore.safeFilename(modFile.fileName());
        if (!filename.toLowerCase().endsWith(".jar")) {
            throw new IOException("Refusing to install a non-JAR mod file: " + filename);
        }

        Path destination = store.modsDirectory(instance).resolve(filename);
        Path temporary = Files.createTempFile(destination.getParent(), filename + ".", ".part");
        try {
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(uri)
                    .header("User-Agent", "ArcForgeLauncher/0.1 (mod manager)")
                    .header("Accept", "application/java-archive,application/octet-stream,*/*")
                    .timeout(Duration.ofMinutes(5))
                    .GET();
            if (modFile.provider() == Domain.ProviderId.CURSEFORGE && !curseForgeApiKey.isBlank()) {
                requestBuilder.header("x-api-key", curseForgeApiKey);
            }
            HttpResponse<InputStream> response = http.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() / 100 != 2) {
                try (InputStream ignored = response.body()) {
                    throw new IOException("Download returned HTTP " + response.statusCode());
                }
            }
            try (InputStream body = response.body()) {
                Files.copy(body, temporary, StandardCopyOption.REPLACE_EXISTING);
            }
            if (!modFile.sha1().isBlank()) {
                String actual = sha1(temporary);
                if (!actual.equalsIgnoreCase(modFile.sha1())) {
                    throw new IOException("Checksum verification failed for " + filename);
                }
            }
            Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING);
            store.recordInstalledMod(instance, new Domain.InstalledMod(modFile.provider(), modFile.projectId(),
                    modFile.projectTitle(), modFile.fileId(), filename, modFile.sha1(), Instant.now()));
            return destination;
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    static String sha1(Path file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            try (InputStream in = Files.newInputStream(file)) {
                byte[] buffer = new byte[16_384];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("The Java runtime does not provide SHA-1", exception);
        }
    }
}
