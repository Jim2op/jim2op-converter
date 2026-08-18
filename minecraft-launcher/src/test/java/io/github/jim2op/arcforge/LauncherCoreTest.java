package io.github.jim2op.arcforge;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LauncherCoreTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void persistsAnInstanceAndItsInstalledMod() throws Exception {
        LauncherStore store = new LauncherStore(temporaryDirectory.resolve("arcforge"));
        Domain.InstanceConfig instance = store.createInstance("Fabric survival", "1.21.1", Domain.ModLoader.FABRIC,
                "", "");

        assertEquals(1, store.listInstances().size());
        assertTruePathExists(store.modsDirectory(instance));

        Domain.InstalledMod installed = new Domain.InstalledMod(Domain.ProviderId.MODRINTH, "abc123", "Example Mod",
                "version-1", "example.jar", "aabb", null);
        store.recordInstalledMod(instance, installed);

        List<Domain.InstalledMod> installedMods = store.listInstalledMods(instance);
        assertEquals(1, installedMods.size());
        assertEquals("example.jar", installedMods.getFirst().fileName());
    }

    @Test
    void rejectsPathTraversalInModFileNames() {
        assertThrows(IllegalArgumentException.class, () -> LauncherStore.safeFilename("../untrusted.jar"));
        assertThrows(IllegalArgumentException.class, () -> LauncherStore.safeFilename(".."));
    }

    @Test
    void parsesQuotedLaunchCommandsAndRejectsUnmatchedQuotes() {
        assertEquals(List.of("java", "-jar", "/games/My Launcher/wrapper.jar", "--user", "Alex"),
                GameLaunchService.parseCommand("java -jar '/games/My Launcher/wrapper.jar' --user Alex"));
        assertThrows(IllegalArgumentException.class, () -> GameLaunchService.parseCommand("java -jar 'missing.jar"));
    }

    @Test
    void localAccountSessionRequiresFutureExpiry() {
        Domain.AccountProfile profile = new Domain.AccountProfile("uuid", "Alex", "token",
                java.time.Instant.now().minusSeconds(1));
        assertFalse(profile.readyForOnlineLaunch());
    }

    private static void assertTruePathExists(Path path) {
        if (!Files.exists(path)) {
            throw new AssertionError("Expected path to exist: " + path);
        }
    }
}
