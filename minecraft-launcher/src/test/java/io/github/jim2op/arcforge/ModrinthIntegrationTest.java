package io.github.jim2op.arcforge;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Runs only when -Darcforge.integration=true is supplied. It exercises the public Modrinth API. */
class ModrinthIntegrationTest {
    @Test
    void findsAndResolvesCompatibleFabricApiFiles() throws Exception {
        Assumptions.assumeTrue(Boolean.getBoolean("arcforge.integration"), "Live API test is opt-in");
        ModrinthProvider provider = new ModrinthProvider();
        List<Domain.ModProject> projects = provider.search("Fabric API", "1.21.1", Domain.ModLoader.FABRIC);
        assertFalse(projects.isEmpty(), "Expected public Modrinth search results");

        Domain.ModProject project = projects.stream()
                .filter(candidate -> candidate.title().equalsIgnoreCase("Fabric API"))
                .findFirst().orElse(projects.getFirst());
        List<Domain.ModFile> files = provider.compatibleFiles(project, "1.21.1", Domain.ModLoader.FABRIC);
        assertFalse(files.isEmpty(), "Expected at least one compatible version file");
        assertTrue(files.stream().anyMatch(file -> file.fileName().endsWith(".jar") && file.downloadUrl().startsWith("https://")));
    }
}
