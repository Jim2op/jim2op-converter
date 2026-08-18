package io.github.jim2op.arcforge;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Core immutable data types used by the launcher. */
public final class Domain {
    private Domain() {
    }

    public enum ProviderId {
        MODRINTH("Modrinth"),
        CURSEFORGE("CurseForge");

        private final String displayName;

        ProviderId(String displayName) {
            this.displayName = displayName;
        }

        public String displayName() {
            return displayName;
        }
    }

    public enum ModLoader {
        ANY("Any loader"),
        FABRIC("Fabric"),
        FORGE("Forge"),
        NEOFORGE("NeoForge"),
        QUILT("Quilt");

        private final String displayName;

        ModLoader(String displayName) {
            this.displayName = displayName;
        }

        public String displayName() {
            return displayName;
        }

        public String modrinthValue() {
            return switch (this) {
                case ANY -> "";
                case FABRIC -> "fabric";
                case FORGE -> "forge";
                case NEOFORGE -> "neoforge";
                case QUILT -> "quilt";
            };
        }

        public int curseForgeValue() {
            return switch (this) {
                case ANY -> 0;
                case FORGE -> 1;
                case FABRIC -> 4;
                case QUILT -> 5;
                case NEOFORGE -> 6;
            };
        }
    }

    public record LauncherPreferences(String curseForgeApiKey, String microsoftClientId) {
        public LauncherPreferences {
            curseForgeApiKey = blankToEmpty(curseForgeApiKey);
            microsoftClientId = blankToEmpty(microsoftClientId);
        }

        public static LauncherPreferences defaults() {
            return new LauncherPreferences("", "");
        }
    }

    public record InstanceConfig(
            String id,
            String name,
            String minecraftVersion,
            ModLoader loader,
            String gameDirectory,
            String commandTemplate,
            Instant createdAt
    ) {
        public InstanceConfig {
            Objects.requireNonNull(id, "id");
            name = requireText(name, "name");
            minecraftVersion = requireText(minecraftVersion, "minecraftVersion");
            loader = loader == null ? ModLoader.ANY : loader;
            gameDirectory = blankToEmpty(gameDirectory);
            commandTemplate = blankToEmpty(commandTemplate);
            createdAt = createdAt == null ? Instant.now() : createdAt;
        }

        public Path gameDirectoryPath() {
            return gameDirectory.isBlank() ? null : Path.of(gameDirectory);
        }
    }

    public record ModProject(
            ProviderId provider,
            String projectId,
            String slug,
            String title,
            String summary,
            String iconUrl,
            long downloads
    ) {
        public ModProject {
            Objects.requireNonNull(provider, "provider");
            projectId = requireText(projectId, "projectId");
            slug = blankToEmpty(slug);
            title = requireText(title, "title");
            summary = blankToEmpty(summary);
            iconUrl = blankToEmpty(iconUrl);
        }

        @Override
        public String toString() {
            return title + " — " + summary;
        }
    }

    public record ModFile(
            ProviderId provider,
            String projectId,
            String projectTitle,
            String fileId,
            String fileName,
            String downloadUrl,
            String sha1,
            long size,
            List<String> dependencies
    ) {
        public ModFile {
            Objects.requireNonNull(provider, "provider");
            projectId = requireText(projectId, "projectId");
            projectTitle = requireText(projectTitle, "projectTitle");
            fileId = requireText(fileId, "fileId");
            fileName = requireText(fileName, "fileName");
            downloadUrl = blankToEmpty(downloadUrl);
            sha1 = blankToEmpty(sha1);
            dependencies = dependencies == null ? List.of() : List.copyOf(dependencies);
        }

        public boolean downloadable() {
            return !downloadUrl.isBlank();
        }

        @Override
        public String toString() {
            return fileName + " (" + fileId + ")";
        }
    }

    public record InstalledMod(
            ProviderId provider,
            String projectId,
            String projectTitle,
            String fileId,
            String fileName,
            String sha1,
            Instant installedAt
    ) {
        public InstalledMod {
            installedAt = installedAt == null ? Instant.now() : installedAt;
        }
    }

    /** In-memory only official Minecraft session. Refresh tokens are never written to disk. */
    public record AccountProfile(String uuid, String username, String minecraftAccessToken, Instant expiresAt) {
        public AccountProfile {
            uuid = requireText(uuid, "uuid");
            username = requireText(username, "username");
            minecraftAccessToken = requireText(minecraftAccessToken, "minecraftAccessToken");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
        }

        public boolean readyForOnlineLaunch() {
            return expiresAt.isAfter(Instant.now().plusSeconds(30));
        }
    }

    public record DeviceCode(String deviceCode, String userCode, String verificationUri, String message,
                             int expiresInSeconds, int intervalSeconds) {
        public DeviceCode {
            deviceCode = requireText(deviceCode, "deviceCode");
            userCode = requireText(userCode, "userCode");
            verificationUri = requireText(verificationUri, "verificationUri");
            message = blankToEmpty(message);
            if (expiresInSeconds <= 0) {
                throw new IllegalArgumentException("expiresInSeconds must be positive");
            }
            if (intervalSeconds <= 0) {
                intervalSeconds = 5;
            }
        }
    }

    static String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    static String requireText(String value, String name) {
        String cleaned = blankToEmpty(value);
        if (cleaned.isEmpty()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return cleaned;
    }
}
