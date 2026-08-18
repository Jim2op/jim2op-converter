package io.github.jim2op.arcforge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Obtains an official Minecraft Services access token with Microsoft's device-code flow.
 * This class intentionally keeps every issued token in memory only.
 */
public final class MicrosoftAuthService {
    private static final String MICROSOFT_TENANT = "consumers";
    private static final String MICROSOFT_BASE = "https://login.microsoftonline.com/" + MICROSOFT_TENANT + "/oauth2/v2.0";
    private static final String XBOX_AUTH = "https://user.auth.xboxlive.com/user/authenticate";
    private static final String XSTS_AUTH = "https://xsts.auth.xboxlive.com/xsts/authorize";
    private static final String MINECRAFT_LOGIN = "https://api.minecraftservices.com/authentication/login_with_xbox";
    private static final String MINECRAFT_ENTITLEMENTS = "https://api.minecraftservices.com/entitlements/mcstore";
    private static final String MINECRAFT_PROFILE = "https://api.minecraftservices.com/minecraft/profile";
    private static final String DEVICE_SCOPE = "XboxLive.signin offline_access";

    private final HttpClient http;
    private final Gson gson;

    public MicrosoftAuthService() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build(), new Gson());
    }

    MicrosoftAuthService(HttpClient http, Gson gson) {
        this.http = Objects.requireNonNull(http, "http");
        this.gson = Objects.requireNonNull(gson, "gson");
    }

    public Domain.DeviceCode beginDeviceCode(String clientId) throws IOException, InterruptedException {
        String normalizedClientId = validateClientId(clientId);
        JsonObject response = sendForm(URI.create(MICROSOFT_BASE + "/devicecode"), Map.of(
                "client_id", normalizedClientId,
                "scope", DEVICE_SCOPE), false);
        return new Domain.DeviceCode(required(response, "device_code"), required(response, "user_code"),
                required(response, "verification_uri"), optional(response, "message"),
                response.get("expires_in").getAsInt(), response.has("interval") ? response.get("interval").getAsInt() : 5);
    }

    public Domain.AccountProfile awaitOfficialMinecraftProfile(String clientId, Domain.DeviceCode deviceCode)
            throws IOException, InterruptedException {
        String normalizedClientId = validateClientId(clientId);
        Instant deadline = Instant.now().plusSeconds(deviceCode.expiresInSeconds());
        int interval = deviceCode.intervalSeconds();
        JsonObject token;
        while (true) {
            if (Instant.now().isAfter(deadline)) {
                throw new IOException("Microsoft sign-in expired before it was completed");
            }
            try {
                token = sendForm(URI.create(MICROSOFT_BASE + "/token"), Map.of(
                        "grant_type", "urn:ietf:params:oauth:grant-type:device_code",
                        "client_id", normalizedClientId,
                        "device_code", deviceCode.deviceCode()), true);
                break;
            } catch (OAuthPollingException pending) {
                if ("authorization_pending".equals(pending.code())) {
                    Thread.sleep(interval * 1000L);
                    continue;
                }
                if ("slow_down".equals(pending.code())) {
                    interval += 5;
                    Thread.sleep(interval * 1000L);
                    continue;
                }
                if ("authorization_declined".equals(pending.code())) {
                    throw new IOException("Microsoft sign-in was declined");
                }
                if ("expired_token".equals(pending.code())) {
                    throw new IOException("Microsoft sign-in code expired");
                }
                throw new IOException("Microsoft sign-in failed: " + pending.description());
            }
        }
        return exchangeForMinecraftProfile(required(token, "access_token"), token.has("expires_in") ? token.get("expires_in").getAsLong() : 3600L);
    }

    private Domain.AccountProfile exchangeForMinecraftProfile(String microsoftToken, long microsoftTokenLifetime)
            throws IOException, InterruptedException {
        JsonObject xblProperties = new JsonObject();
        xblProperties.addProperty("AuthMethod", "RPS");
        xblProperties.addProperty("SiteName", "user.auth.xboxlive.com");
        xblProperties.addProperty("RpsTicket", "d=" + microsoftToken);
        JsonObject xbl = sendJson(URI.create(XBOX_AUTH), xboxRequest("http://auth.xboxlive.com", xblProperties), null);
        String xblToken = required(xbl, "Token");
        String userHash = xbl.getAsJsonObject("DisplayClaims").getAsJsonArray("xui").get(0)
                .getAsJsonObject().get("uhs").getAsString();

        JsonObject xstsProperties = new JsonObject();
        xstsProperties.addProperty("SandboxId", "RETAIL");
        JsonArray userTokens = new JsonArray();
        userTokens.add(xblToken);
        xstsProperties.add("UserTokens", userTokens);
        JsonObject xsts = sendJson(URI.create(XSTS_AUTH), xboxRequest("rp://api.minecraftservices.com/", xstsProperties), null);
        String xstsToken = required(xsts, "Token");

        JsonObject minecraftRequest = new JsonObject();
        minecraftRequest.addProperty("identityToken", "XBL3.0 x=" + userHash + ";" + xstsToken);
        minecraftRequest.addProperty("ensureLegacyEnabled", false);
        JsonObject minecraftToken = sendJson(URI.create(MINECRAFT_LOGIN), minecraftRequest, null);
        String accessToken = required(minecraftToken, "access_token");
        long minecraftLifetime = minecraftToken.has("expires_in") ? minecraftToken.get("expires_in").getAsLong() : microsoftTokenLifetime;

        JsonObject entitlements = sendGet(URI.create(MINECRAFT_ENTITLEMENTS), accessToken);
        if (!entitlements.has("items") || !entitlements.get("items").isJsonArray()
                || entitlements.getAsJsonArray("items").isEmpty()) {
            throw new IOException("This Microsoft account does not have a verified Minecraft Java entitlement");
        }
        JsonObject profile = sendGet(URI.create(MINECRAFT_PROFILE), accessToken);
        return new Domain.AccountProfile(required(profile, "id"), required(profile, "name"), accessToken,
                Instant.now().plusSeconds(Math.max(60L, minecraftLifetime)));
    }

    private JsonObject sendForm(URI uri, Map<String, String> fields, boolean toleratePollingErrors)
            throws IOException, InterruptedException {
        requireHttps(uri);
        String body = formEncode(fields);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        JsonObject payload = parseObject(response.body(), "Microsoft response");
        if (response.statusCode() / 100 != 2) {
            if (toleratePollingErrors && payload.has("error")) {
                throw new OAuthPollingException(optional(payload, "error"), optional(payload, "error_description"));
            }
            throw new IOException("Microsoft authorization returned HTTP " + response.statusCode() + ": " + optional(payload, "error_description"));
        }
        return payload;
    }

    private JsonObject sendJson(URI uri, JsonObject payload, String bearerToken) throws IOException, InterruptedException {
        requireHttps(uri);
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(payload), StandardCharsets.UTF_8));
        if (bearerToken != null) {
            builder.header("Authorization", "Bearer " + bearerToken);
        }
        HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Account verification endpoint returned HTTP " + response.statusCode() + ": " + compact(response.body()));
        }
        return parseObject(response.body(), "account verification response");
    }

    private JsonObject sendGet(URI uri, String bearerToken) throws IOException, InterruptedException {
        requireHttps(uri);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("Authorization", "Bearer " + bearerToken)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Minecraft Services returned HTTP " + response.statusCode() + ": " + compact(response.body()));
        }
        return parseObject(response.body(), "Minecraft Services response");
    }

    private static JsonObject xboxRequest(String relyingParty, JsonObject properties) {
        JsonObject request = new JsonObject();
        request.addProperty("RelyingParty", relyingParty);
        request.addProperty("TokenType", "JWT");
        request.add("Properties", properties);
        return request;
    }

    private static String validateClientId(String clientId) {
        String normalized = Domain.blankToEmpty(clientId);
        if (!normalized.matches("[0-9a-fA-F-]{36}")) {
            throw new IllegalArgumentException("Enter the public application (client) ID from your Microsoft Entra app registration");
        }
        return normalized;
    }

    private static String formEncode(Map<String, String> fields) {
        Map<String, String> ordered = new LinkedHashMap<>(fields);
        return ordered.entrySet().stream()
                .map(entry -> URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8) + "="
                        + URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8))
                .reduce((left, right) -> left + "&" + right).orElse("");
    }

    private JsonObject parseObject(String response, String label) throws IOException {
        try {
            JsonObject parsed = gson.fromJson(response, JsonObject.class);
            if (parsed == null) {
                throw new IOException(label + " was empty");
            }
            return parsed;
        } catch (RuntimeException exception) {
            throw new IOException(label + " was not valid JSON", exception);
        }
    }

    private static String required(JsonObject object, String property) {
        String value = optional(object, property);
        if (value.isBlank()) {
            throw new IllegalArgumentException("Account response did not contain " + property);
        }
        return value;
    }

    private static String optional(JsonObject object, String property) {
        return object.has(property) && !object.get(property).isJsonNull() ? object.get(property).getAsString() : "";
    }

    private static String compact(String value) {
        String normalized = Objects.requireNonNullElse(value, "").replaceAll("\\s+", " ").trim();
        return normalized.substring(0, Math.min(240, normalized.length()));
    }

    private static void requireHttps(URI uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Account endpoints must use HTTPS");
        }
    }

    private static final class OAuthPollingException extends RuntimeException {
        private final String code;
        private final String description;

        private OAuthPollingException(String code, String description) {
            super(description);
            this.code = code;
            this.description = description;
        }

        private String code() {
            return code;
        }

        private String description() {
            return description;
        }
    }
}
