# ArcForge Launcher

ArcForge is a **Java 21 desktop Minecraft Java Edition instance and mod manager**. It provides a JavaFX interface for creating isolated profiles, browsing compatible mods from Modrinth, enabling CurseForge support with an approved local API key, downloading selected JAR files with checksum verification, and launching a configured local game profile only after official Microsoft/Minecraft sign-in.

> **Online-mode boundary:** ArcForge does not create fake accounts, bypass Minecraft ownership, or manufacture tokens to access authenticated servers. It supports online launch only for a Microsoft account that completes the official device-code flow and passes Minecraft Services entitlement verification.

## Capabilities

| Capability | Status | Notes |
| --- | --- | --- |
| Java 21 desktop interface | Implemented | JavaFX application with instances, mod discovery, settings, activity log, and safety guidance. |
| Modrinth discovery and file resolution | Implemented | Uses public Labrinth search and version endpoints, filtering on Minecraft version and loader.[1] |
| Modrinth JAR installation | Implemented | Streams a selected HTTPS file into the selected instance, validates supplied SHA-1 metadata, and records it locally. |
| CurseForge discovery and file resolution | Implemented | Uses CurseForge’s third-party API when an operator-provided approved API key is configured.[2] |
| CurseForge JAR installation | Implemented when download URL is available | Uses the configured API key only for the CurseForge request and download. |
| Microsoft device-code sign-in | Implemented | The user signs in at Microsoft’s verification page; the app never asks for a password.[3] |
| Minecraft ownership check | Implemented | Exchanges the signed-in account through Xbox Live/XSTS/Minecraft Services and blocks online launch without an entitlement. |
| Game bootstrap and loader installation | Deliberately external | Use a locally installed legitimate Forge, NeoForge, Fabric, or Quilt profile and provide its launch command. |

## Requirements

ArcForge requires **JDK 21** and Maven 3.8 or later. It is deliberately implemented as a separate Maven module at `minecraft-launcher/`, leaving the repository’s existing Node.js converter untouched.

```bash
cd minecraft-launcher
mvn test
mvn javafx:run
```

The app stores its local configuration under `~/.arcforge-launcher` by default. To use a disposable location during development or testing, supply a Java system property:

```bash
mvn -Darcforge.home=/absolute/path/to/test-profile javafx:run
```

## First-time setup

Start ArcForge, open **Settings**, and enter the values you need. Modrinth works without a user-provided key for public discovery. CurseForge requires a key approved for the operator’s third-party service integration; do not publish this value in source code, releases, screenshots, or issue reports. CurseForge documents its API and its key application process here.[2]

For online-mode sign-in, create a **public Microsoft Entra application registration** for the launcher and enter the application (client) ID. Do not enter a client secret: a desktop app distributed to other users cannot safely keep one. When you choose **Sign in with Microsoft**, ArcForge requests a device code, opens Microsoft’s verification page where possible, and then polls for completion exactly as documented for the device authorization grant.[3]

| Setting | Required for | Storage behavior |
| --- | --- | --- |
| CurseForge API key | CurseForge browsing and authorized file downloads | Stored locally in `preferences.json`; may instead be set initially with `ARCFORGE_CURSEFORGE_API_KEY`. |
| Microsoft application client ID | Official Microsoft sign-in | Stored locally in `preferences.json`; may instead be set initially with `ARCFORGE_MS_CLIENT_ID`. |
| Microsoft password | Never | ArcForge never requests, receives, or stores it. |
| Minecraft access and refresh tokens | Current signed-in session only | Kept in memory and cleared when the application exits. |

## Creating an instance

An ArcForge instance holds a Minecraft version, a loader label, mod records, and a directory containing its downloaded mods. You may leave **Game directory** empty to use ArcForge’s profile directory, or select the directory of a locally installed legitimate game/loader profile. In the latter case, ArcForge puts downloaded JARs in that directory’s `mods/` folder.

ArcForge intentionally takes an explicit command template rather than silently distributing or patching the commercial game client. The command must start a locally installed, legitimate launch wrapper or game profile. The following placeholders are expanded only after a verified account session is available:

| Placeholder | Value |
| --- | --- |
| `{accessToken}` | In-memory Minecraft Services access token for the verified account. |
| `{uuid}` | Verified Java-profile UUID. |
| `{username}` | Verified Java-profile name. |
| `{gameDir}` | Selected game directory, or ArcForge’s instance directory. |
| `{version}` | The Minecraft version entered for this instance. |

For example, a wrapper maintained by the user could accept the following arguments:

```text
java -jar /absolute/path/to/your-official-launch-wrapper.jar --accessToken {accessToken} --uuid {uuid} --username {username} --gameDir {gameDir} --version {version}
```

The example only illustrates ArcForge’s template substitution; it is not a bundled game downloader, an authentication bypass, or a claim that an arbitrary wrapper will accept those flags.

## Development and verification

Run the standard fast test suite:

```bash
mvn test
```

Run the opt-in live Modrinth test, which searches Modrinth and resolves a compatible Fabric API JAR for Minecraft 1.21.1:

```bash
mvn -Darcforge.integration=true -Dtest=ModrinthIntegrationTest test
```

The project includes tests for atomic local instance metadata, installed-mod recording, path-traversal rejection, command quoting, expired-session launch blocking, and the opt-in public Modrinth workflow. Live CurseForge tests are excluded because they must use the operator’s own approved key.

## Security design

ArcForge accepts artifacts only from HTTPS download URLs, permits only simple `.jar` filenames, writes into a temporary file before moving it into `mods/`, and verifies an advertised SHA-1 checksum when the provider returns one. Its launch action stays disabled until all three of the following are true: an instance is selected, a command template has been supplied, and an unexpired verified Minecraft Services account is in memory.

If the user is not signed in, ArcForge still allows instance and local mod-file organization. It does not label such a state “online mode” or enable a server-authenticated launch.

## References

[1] [Modrinth API overview](https://docs.modrinth.com/api/)

[2] [CurseForge API documentation](https://docs.curseforge.com/rest-api/)

[3] [Microsoft identity platform: OAuth 2.0 device authorization grant](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)
