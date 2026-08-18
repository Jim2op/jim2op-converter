package io.github.jim2op.arcforge;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;

/** Starts an explicitly configured official local game command; it does not manufacture launch credentials. */
public final class GameLaunchService {
    private final LauncherStore store;

    public GameLaunchService(LauncherStore store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    public Process launchOnline(Domain.InstanceConfig instance, Domain.AccountProfile account, Consumer<String> gameLog)
            throws IOException {
        Objects.requireNonNull(instance, "instance");
        Objects.requireNonNull(account, "account");
        Objects.requireNonNull(gameLog, "gameLog");
        if (!account.readyForOnlineLaunch()) {
            throw new IllegalStateException("Official Minecraft sign-in is required before an online launch");
        }
        if (instance.commandTemplate().isBlank()) {
            throw new IllegalStateException("Add a local official-game launch command to this instance first");
        }

        Path gameDirectory = resolveGameDirectory(instance);
        Files.createDirectories(gameDirectory);
        List<String> templateTokens = parseCommand(instance.commandTemplate());
        if (templateTokens.isEmpty()) {
            throw new IllegalStateException("The launch command is empty");
        }
        Map<String, String> placeholders = Map.of(
                "{accessToken}", account.minecraftAccessToken(),
                "{uuid}", account.uuid(),
                "{username}", account.username(),
                "{gameDir}", gameDirectory.toAbsolutePath().toString(),
                "{version}", instance.minecraftVersion());
        List<String> command = templateTokens.stream().map(token -> replace(token, placeholders)).toList();
        ProcessBuilder processBuilder = new ProcessBuilder(command)
                .directory(gameDirectory.toFile())
                .redirectErrorStream(true);
        gameLog.accept("Starting official game profile ‘" + instance.name() + "’ for " + account.username() + ".");
        Process process = processBuilder.start();
        Thread.ofVirtual().name("arcforge-game-log").start(() -> streamLog(process, gameLog));
        return process;
    }

    public Path resolveGameDirectory(Domain.InstanceConfig instance) throws IOException {
        Path configured = instance.gameDirectoryPath();
        Path gameDirectory = configured == null ? store.instanceDirectory(instance) : configured;
        Files.createDirectories(gameDirectory);
        return gameDirectory;
    }

    private static void streamLog(Process process, Consumer<String> consumer) {
        try (BufferedReader reader = process.inputReader(StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                consumer.accept(line);
            }
            consumer.accept("Game process exited with code " + process.exitValue() + " at " + Instant.now() + ".");
        } catch (IOException exception) {
            consumer.accept("Unable to read game output: " + exception.getMessage());
        }
    }

    static List<String> parseCommand(String template) {
        List<String> tokens = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        char quote = 0;
        boolean escaping = false;
        for (char c : template.trim().toCharArray()) {
            if (escaping) {
                current.append(c);
                escaping = false;
                continue;
            }
            if (c == '\\') {
                escaping = true;
                continue;
            }
            if ((c == '\'' || c == '"')) {
                if (!quoted) {
                    quoted = true;
                    quote = c;
                } else if (quote == c) {
                    quoted = false;
                    quote = 0;
                } else {
                    current.append(c);
                }
                continue;
            }
            if (Character.isWhitespace(c) && !quoted) {
                if (!current.isEmpty()) {
                    tokens.add(current.toString());
                    current.setLength(0);
                }
                continue;
            }
            current.append(c);
        }
        if (escaping) {
            current.append('\\');
        }
        if (quoted) {
            throw new IllegalArgumentException("The launch command contains an unmatched quote");
        }
        if (!current.isEmpty()) {
            tokens.add(current.toString());
        }
        return List.copyOf(tokens);
    }

    private static String replace(String input, Map<String, String> placeholders) {
        String output = input;
        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            output = output.replace(entry.getKey(), entry.getValue());
        }
        return output;
    }
}
