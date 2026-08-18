package io.github.jim2op.arcforge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** A read-only mod catalogue integration. */
public interface ModProvider {
    Domain.ProviderId id();

    boolean isConfigured();

    String configurationHint();

    List<Domain.ModProject> search(String query, String minecraftVersion, Domain.ModLoader loader) throws IOException, InterruptedException;

    List<Domain.ModFile> compatibleFiles(Domain.ModProject project, String minecraftVersion, Domain.ModLoader loader)
            throws IOException, InterruptedException;

    static List<ModProvider> createDefaultProviders(LauncherStore store) throws IOException {
        Domain.LauncherPreferences preferences = store.loadPreferences();
        return List.of(new ModrinthProvider(), new CurseForgeProvider(preferences.curseForgeApiKey()));
    }
}

final class ModrinthProvider implements ModProvider {
    private static final String API_ROOT = "https://api.modrinth.com/v2";
    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(20)).build();
    private final Gson gson = new Gson();

    @Override
    public Domain.ProviderId id() {
        return Domain.ProviderId.MODRINTH;
    }

    @Override
    public boolean isConfigured() {
        return true;
    }

    @Override
    public String configurationHint() {
        return "Ready";
    }

    @Override
    public List<Domain.ModProject> search(String query, String minecraftVersion, Domain.ModLoader loader)
            throws IOException, InterruptedException {
        String facets = buildFacets(minecraftVersion, loader);
        URI uri = URI.create(API_ROOT + "/search?limit=30&query=" + encode(query) + "&facets=" + encode(facets));
        JsonObject root = getJson(uri).getAsJsonObject();
        JsonArray hits = root.has("hits") ? root.getAsJsonArray("hits") : new JsonArray();
        List<Domain.ModProject> results = new ArrayList<>();
        for (JsonElement hitElement : hits) {
            JsonObject hit = hitElement.getAsJsonObject();
            results.add(new Domain.ModProject(
                    id(),
                    string(hit, "project_id"),
                    optionalString(hit, "slug"),
                    string(hit, "title"),
                    optionalString(hit, "description"),
                    optionalString(hit, "icon_url"),
                    longValue(hit, "downloads")));
        }
        return results;
    }

    @Override
    public List<Domain.ModFile> compatibleFiles(Domain.ModProject project, String minecraftVersion, Domain.ModLoader loader)
            throws IOException, InterruptedException {
        if (project.provider() != id()) {
            throw new IllegalArgumentException("Project does not belong to Modrinth");
        }
        StringBuilder url = new StringBuilder(API_ROOT).append("/project/").append(encodePath(project.projectId())).append("/version");
        List<String> parameters = new ArrayList<>();
        if (!minecraftVersion.isBlank()) {
            parameters.add("game_versions=" + encode("[\"" + minecraftVersion + "\"]"));
        }
        if (loader != Domain.ModLoader.ANY) {
            parameters.add("loaders=" + encode("[\"" + loader.modrinthValue() + "\"]"));
        }
        if (!parameters.isEmpty()) {
            url.append('?').append(String.join("&", parameters));
        }
        JsonArray versions = getJson(URI.create(url.toString())).getAsJsonArray();
        List<Domain.ModFile> files = new ArrayList<>();
        for (JsonElement versionElement : versions) {
            JsonObject version = versionElement.getAsJsonObject();
            JsonArray candidates = version.has("files") ? version.getAsJsonArray("files") : new JsonArray();
            JsonObject selected = selectPrimaryFile(candidates);
            if (selected == null) {
                continue;
            }
            List<String> dependencies = readModrinthDependencies(version);
            JsonObject hashes = selected.has("hashes") ? selected.getAsJsonObject("hashes") : new JsonObject();
            files.add(new Domain.ModFile(id(), project.projectId(), project.title(), string(version, "id"),
                    string(selected, "filename"), string(selected, "url"), optionalString(hashes, "sha1"),
                    longValue(selected, "size"), dependencies));
        }
        return files;
    }

    private JsonElement getJson(URI uri) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("User-Agent", "ArcForgeLauncher/0.1 (mod manager)")
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Modrinth API returned HTTP " + response.statusCode() + ": " + compact(response.body()));
        }
        return gson.fromJson(response.body(), JsonElement.class);
    }

    private static String buildFacets(String minecraftVersion, Domain.ModLoader loader) {
        List<String> facets = new ArrayList<>();
        facets.add("[\"project_type:mod\"]");
        if (minecraftVersion != null && !minecraftVersion.isBlank()) {
            facets.add("[\"versions:" + escapeFacet(minecraftVersion) + "\"]");
        }
        if (loader != Domain.ModLoader.ANY) {
            facets.add("[\"categories:" + loader.modrinthValue() + "\"]");
        }
        return "[" + String.join(",", facets) + "]";
    }

    private static JsonObject selectPrimaryFile(JsonArray files) {
        JsonObject fallback = null;
        for (JsonElement fileElement : files) {
            JsonObject file = fileElement.getAsJsonObject();
            if (fallback == null) {
                fallback = file;
            }
            if (file.has("primary") && file.get("primary").getAsBoolean()) {
                return file;
            }
        }
        return fallback;
    }

    private static List<String> readModrinthDependencies(JsonObject version) {
        if (!version.has("dependencies")) {
            return List.of();
        }
        List<String> dependencies = new ArrayList<>();
        for (JsonElement dependencyElement : version.getAsJsonArray("dependencies")) {
            JsonObject dependency = dependencyElement.getAsJsonObject();
            if (dependency.has("dependency_type") && "required".equals(dependency.get("dependency_type").getAsString())
                    && dependency.has("project_id")) {
                dependencies.add(dependency.get("project_id").getAsString());
            }
        }
        return dependencies;
    }

    private static String escapeFacet(String input) {
        return input.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String encode(String input) {
        return URLEncoder.encode(input == null ? "" : input, StandardCharsets.UTF_8);
    }

    private static String encodePath(String input) {
        return encode(input).replace("+", "%20");
    }

    static String string(JsonObject object, String member) {
        if (!object.has(member) || object.get(member).isJsonNull()) {
            throw new IllegalArgumentException("Provider response did not contain " + member);
        }
        return object.get(member).getAsString();
    }

    static String optionalString(JsonObject object, String member) {
        return object.has(member) && !object.get(member).isJsonNull() ? object.get(member).getAsString() : "";
    }

    static long longValue(JsonObject object, String member) {
        return object.has(member) && !object.get(member).isJsonNull() ? object.get(member).getAsLong() : 0L;
    }

    static String compact(String body) {
        String normalized = Objects.requireNonNullElse(body, "").replaceAll("\\s+", " ").trim();
        return normalized.substring(0, Math.min(normalized.length(), 240));
    }
}

final class CurseForgeProvider implements ModProvider {
    private static final String API_ROOT = "https://api.curseforge.com/v1";
    private static final int MINECRAFT_GAME_ID = 432;

    private final String apiKey;
    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(20)).build();
    private final Gson gson = new Gson();

    CurseForgeProvider(String apiKey) {
        this.apiKey = Domain.blankToEmpty(apiKey);
    }

    @Override
    public Domain.ProviderId id() {
        return Domain.ProviderId.CURSEFORGE;
    }

    @Override
    public boolean isConfigured() {
        return !apiKey.isBlank();
    }

    @Override
    public String configurationHint() {
        return isConfigured() ? "Ready with a local API key" : "Add an approved CurseForge API key in Settings";
    }

    @Override
    public List<Domain.ModProject> search(String query, String minecraftVersion, Domain.ModLoader loader)
            throws IOException, InterruptedException {
        requireConfigured();
        StringBuilder endpoint = new StringBuilder(API_ROOT).append("/mods/search?gameId=").append(MINECRAFT_GAME_ID)
                .append("&pageSize=30&searchFilter=").append(encode(query));
        if (minecraftVersion != null && !minecraftVersion.isBlank()) {
            endpoint.append("&gameVersion=").append(encode(minecraftVersion));
        }
        if (loader != Domain.ModLoader.ANY) {
            endpoint.append("&modLoaderType=").append(loader.curseForgeValue());
        }
        JsonArray data = getJson(URI.create(endpoint.toString())).getAsJsonObject().getAsJsonArray("data");
        List<Domain.ModProject> results = new ArrayList<>();
        for (JsonElement element : data) {
            JsonObject mod = element.getAsJsonObject();
            JsonObject logo = mod.has("logo") && mod.get("logo").isJsonObject() ? mod.getAsJsonObject("logo") : new JsonObject();
            results.add(new Domain.ModProject(id(), String.valueOf(longValue(mod, "id")), optionalString(mod, "slug"),
                    string(mod, "name"), optionalString(mod, "summary"), optionalString(logo, "thumbnailUrl"),
                    longValue(mod, "downloadCount")));
        }
        return results;
    }

    @Override
    public List<Domain.ModFile> compatibleFiles(Domain.ModProject project, String minecraftVersion, Domain.ModLoader loader)
            throws IOException, InterruptedException {
        requireConfigured();
        if (project.provider() != id()) {
            throw new IllegalArgumentException("Project does not belong to CurseForge");
        }
        StringBuilder endpoint = new StringBuilder(API_ROOT).append("/mods/").append(encodePath(project.projectId())).append("/files?pageSize=50");
        if (minecraftVersion != null && !minecraftVersion.isBlank()) {
            endpoint.append("&gameVersion=").append(encode(minecraftVersion));
        }
        if (loader != Domain.ModLoader.ANY) {
            endpoint.append("&modLoaderType=").append(loader.curseForgeValue());
        }
        JsonArray data = getJson(URI.create(endpoint.toString())).getAsJsonObject().getAsJsonArray("data");
        List<Domain.ModFile> files = new ArrayList<>();
        for (JsonElement element : data) {
            JsonObject file = element.getAsJsonObject();
            files.add(new Domain.ModFile(id(), project.projectId(), project.title(), String.valueOf(longValue(file, "id")),
                    optionalStringOr(file, "fileName", "displayName"), optionalString(file, "downloadUrl"),
                    extractSha1(file), longValue(file, "fileLength"), List.of()));
        }
        return files.stream().sorted(Comparator.comparing(Domain.ModFile::fileName).reversed()).toList();
    }

    private JsonElement getJson(URI uri) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("User-Agent", "ArcForgeLauncher/0.1 (mod manager)")
                .header("Accept", "application/json")
                .header("x-api-key", apiKey)
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IOException("CurseForge API returned HTTP " + response.statusCode() + ": " + ModrinthProvider.compact(response.body()));
        }
        JsonObject root = gson.fromJson(response.body(), JsonObject.class);
        if (!root.has("data")) {
            throw new IOException("CurseForge response contained no data array");
        }
        return root;
    }

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new IllegalStateException(configurationHint());
        }
    }

    private static String extractSha1(JsonObject file) {
        if (!file.has("hashes") || !file.get("hashes").isJsonArray()) {
            return "";
        }
        for (JsonElement element : file.getAsJsonArray("hashes")) {
            JsonObject hash = element.getAsJsonObject();
            if (hash.has("algo") && hash.get("algo").getAsInt() == 1) {
                return optionalString(hash, "value");
            }
        }
        return "";
    }

    private static String optionalStringOr(JsonObject object, String first, String fallback) {
        String result = optionalString(object, first);
        return result.isBlank() ? optionalString(object, fallback) : result;
    }

    private static String encode(String input) {
        return URLEncoder.encode(input == null ? "" : input, StandardCharsets.UTF_8);
    }

    private static String encodePath(String input) {
        return encode(input).replace("+", "%20");
    }

    private static String string(JsonObject object, String member) {
        return ModrinthProvider.string(object, member);
    }

    private static String optionalString(JsonObject object, String member) {
        return ModrinthProvider.optionalString(object, member);
    }

    private static long longValue(JsonObject object, String member) {
        return ModrinthProvider.longValue(object, member);
    }
}
