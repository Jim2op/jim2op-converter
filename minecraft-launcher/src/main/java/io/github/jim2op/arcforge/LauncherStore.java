package io.github.jim2op.arcforge;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;
import com.google.gson.JsonSerializationContext;
import com.google.gson.JsonSerializer;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Stores launcher preferences and independent instance manifests below a user-owned directory. */
public final class LauncherStore {
    private static final String PREFERENCES_FILE = "preferences.json";
    private static final String INSTANCE_MANIFEST = "instance.json";

    private final Path root;
    private final Gson gson;

    public LauncherStore() throws IOException {
        this(resolveRoot());
    }

    LauncherStore(Path root) throws IOException {
        this.root = root;
        this.gson = new GsonBuilder()
                .setPrettyPrinting()
                .registerTypeAdapter(Instant.class, new InstantAdapter())
                .create();
        Files.createDirectories(instancesRoot());
    }

    public Path root() {
        return root;
    }

    public synchronized Domain.LauncherPreferences loadPreferences() throws IOException {
        Path preferencesPath = root.resolve(PREFERENCES_FILE);
        if (!Files.exists(preferencesPath)) {
            return new Domain.LauncherPreferences(
                    System.getenv().getOrDefault("ARCFORGE_CURSEFORGE_API_KEY", ""),
                    System.getenv().getOrDefault("ARCFORGE_MS_CLIENT_ID", ""));
        }
        Domain.LauncherPreferences preferences = gson.fromJson(Files.readString(preferencesPath), Domain.LauncherPreferences.class);
        return preferences == null ? Domain.LauncherPreferences.defaults() : preferences;
    }

    public synchronized void savePreferences(Domain.LauncherPreferences preferences) throws IOException {
        writeAtomically(root.resolve(PREFERENCES_FILE), gson.toJson(preferences));
    }

    public synchronized Domain.InstanceConfig createInstance(String name, String minecraftVersion,
                                                              Domain.ModLoader loader, String gameDirectory,
                                                              String commandTemplate) throws IOException {
        String id = slug(name) + "-" + UUID.randomUUID().toString().substring(0, 8);
        Domain.InstanceConfig config = new Domain.InstanceConfig(id, name, minecraftVersion, loader,
                gameDirectory, commandTemplate, Instant.now());
        saveManifest(new InstanceManifest(config, List.of()));
        Files.createDirectories(modsDirectory(config));
        return config;
    }

    public synchronized List<Domain.InstanceConfig> listInstances() throws IOException {
        if (!Files.exists(instancesRoot())) {
            return List.of();
        }
        try (var paths = Files.list(instancesRoot())) {
            return paths.filter(Files::isDirectory)
                    .map(path -> path.resolve(INSTANCE_MANIFEST))
                    .filter(Files::exists)
                    .map(this::readManifestUnchecked)
                    .map(InstanceManifest::config)
                    .sorted(Comparator.comparing(Domain.InstanceConfig::createdAt).reversed())
                    .toList();
        }
    }

    public synchronized List<Domain.InstalledMod> listInstalledMods(Domain.InstanceConfig config) throws IOException {
        return List.copyOf(loadManifest(config.id()).mods());
    }

    public synchronized Path modsDirectory(Domain.InstanceConfig config) throws IOException {
        Path base = config.gameDirectoryPath() == null ? instanceDirectory(config.id()) : config.gameDirectoryPath();
        Path mods = base.resolve("mods");
        Files.createDirectories(mods);
        return mods;
    }

    /** Returns the ArcForge-owned profile directory used when no custom game directory is configured. */
    public synchronized Path instanceDirectory(Domain.InstanceConfig config) throws IOException {
        Path directory = instanceDirectory(config.id());
        Files.createDirectories(directory);
        return directory;
    }

    public synchronized void recordInstalledMod(Domain.InstanceConfig config, Domain.InstalledMod mod) throws IOException {
        InstanceManifest manifest = loadManifest(config.id());
        List<Domain.InstalledMod> updated = new ArrayList<>(manifest.mods());
        updated.removeIf(existing -> existing.fileName().equalsIgnoreCase(mod.fileName()));
        updated.add(mod);
        saveManifest(new InstanceManifest(manifest.config(), updated));
    }

    public synchronized void removeInstalledMod(Domain.InstanceConfig config, Domain.InstalledMod mod) throws IOException {
        Files.deleteIfExists(modsDirectory(config).resolve(safeFilename(mod.fileName())));
        InstanceManifest manifest = loadManifest(config.id());
        List<Domain.InstalledMod> updated = manifest.mods().stream()
                .filter(existing -> !existing.fileName().equalsIgnoreCase(mod.fileName()))
                .toList();
        saveManifest(new InstanceManifest(manifest.config(), updated));
    }

    private InstanceManifest loadManifest(String id) throws IOException {
        Path manifestPath = instanceDirectory(id).resolve(INSTANCE_MANIFEST);
        if (!Files.exists(manifestPath)) {
            throw new IOException("Unknown instance: " + id);
        }
        InstanceManifest manifest = gson.fromJson(Files.readString(manifestPath), InstanceManifest.class);
        if (manifest == null || manifest.config() == null) {
            throw new IOException("Instance manifest is invalid: " + manifestPath);
        }
        return new InstanceManifest(manifest.config(), manifest.mods() == null ? List.of() : manifest.mods());
    }

    private InstanceManifest readManifestUnchecked(Path path) {
        try {
            InstanceManifest manifest = gson.fromJson(Files.readString(path), InstanceManifest.class);
            if (manifest == null || manifest.config() == null) {
                throw new IOException("Invalid manifest");
            }
            return manifest;
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to read instance manifest " + path, exception);
        }
    }

    private void saveManifest(InstanceManifest manifest) throws IOException {
        Path directory = instanceDirectory(manifest.config().id());
        Files.createDirectories(directory);
        writeAtomically(directory.resolve(INSTANCE_MANIFEST), gson.toJson(manifest));
    }

    private Path instanceDirectory(String id) {
        if (!id.matches("[a-z0-9][a-z0-9-]{0,80}")) {
            throw new IllegalArgumentException("Invalid instance identifier");
        }
        return instancesRoot().resolve(id);
    }

    private Path instancesRoot() {
        return root.resolve("instances");
    }

    private static Path resolveRoot() {
        String override = System.getProperty("arcforge.home", "").trim();
        return override.isBlank()
                ? Path.of(System.getProperty("user.home"), ".arcforge-launcher")
                : Path.of(override);
    }

    private static void writeAtomically(Path target, String content) throws IOException {
        Files.createDirectories(target.getParent());
        Path temporary = Files.createTempFile(target.getParent(), target.getFileName().toString(), ".tmp");
        Files.writeString(temporary, content, StandardCharsets.UTF_8);
        try {
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    static String safeFilename(String candidate) {
        String supplied = Domain.blankToEmpty(candidate);
        if (supplied.isBlank() || supplied.indexOf('/') >= 0 || supplied.indexOf(92) >= 0 || Path.of(supplied).isAbsolute()) {
            throw new IllegalArgumentException("A simple file name without directory components is required");
        }
        String filename = Path.of(supplied).getFileName().toString();
        if (filename.isBlank() || filename.equals(".") || filename.equals("..")) {
            throw new IllegalArgumentException("A valid file name is required");
        }
        return filename;
    }

    private static String slug(String value) {
        String slug = value.toLowerCase().replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return slug.isBlank() ? "instance" : slug.substring(0, Math.min(slug.length(), 40));
    }

    private record InstanceManifest(Domain.InstanceConfig config, List<Domain.InstalledMod> mods) {
        private InstanceManifest {
            mods = mods == null ? List.of() : List.copyOf(mods);
        }
    }

    private static final class InstantAdapter implements JsonSerializer<Instant>, JsonDeserializer<Instant> {
        @Override
        public JsonElement serialize(Instant source, Type typeOfSource, JsonSerializationContext context) {
            return new JsonPrimitive(source.toString());
        }

        @Override
        public Instant deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext context) {
            return Instant.parse(json.getAsString());
        }
    }
}
