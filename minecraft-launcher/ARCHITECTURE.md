# ArcForge Launcher architecture

## Purpose and scope

ArcForge Launcher is a Java 21 desktop launcher module isolated under `minecraft-launcher/` so it does not change the existing Node.js converter. It manages local modded instances, searches and downloads compatible files from Modrinth and CurseForge, and launches a game only with a valid official Minecraft Java account session. It is intentionally not a “cracked” launcher and does not fabricate identities, authentication tokens, or online-mode sessions.

## Core design

| Area | Implementation decision | Rationale |
| --- | --- | --- |
| Desktop UI | JavaFX with FXML-free programmatic views | Keeps all launcher logic in Java and produces a cross-platform desktop application. |
| HTTP and JSON | Java `HttpClient` and Gson | Uses standard Java networking with a lightweight JSON mapper. |
| Instance layout | `~/.arcforge-launcher/instances/<id>` with `instance.json` and a `mods/` directory | Each game profile and its installed artifacts stay isolated. |
| Mod providers | A provider interface, with public Modrinth support and CurseForge support activated by an API key | The providers have different authorization requirements but a shared UI contract. |
| Mod installation | Explicitly selected file download, SHA-1 verification where supplied, atomic move into `mods/` | Avoids silently installing an incompatible or incomplete JAR. |
| Minecraft launch | A safe command-template adapter for a preinstalled, official game/loader instance | Launching runs an explicit local command and injects a valid authenticated player profile only after ownership is verified. |
| Credentials | A user-created public Microsoft application client ID plus encrypted local refresh-token storage abstraction | No secret is embedded in the distributable and no user password is ever collected by the launcher. |

## Instance model

An instance contains a display name, Minecraft version, selected loader label, a game directory, an optional game command template, and the mods installed through the launcher. The command template can use `{accessToken}`, `{uuid}`, `{username}`, `{gameDir}`, and `{version}` placeholders. Because mod-loader installation contracts change rapidly, this first implementation purposely works with existing, legitimate Forge, NeoForge, Fabric, or Quilt game directories instead of impersonating or redistributing third-party installers.

## Provider contracts

### Modrinth

ArcForge requests projects and versions from the current Labrinth API, filters versions by the configured game version and loader, exposes the primary file, streams that file to the selected instance, and validates the returned SHA-1 checksum when available. Modrinth’s API documentation describes project search, version operations, version-file operations, and loader/game-version tag operations, all of which map directly to this workflow.[1]

### CurseForge

ArcForge supports CurseForge through the Core API when the launcher operator supplies an approved API key in local preferences or the `ARCFORGE_CURSEFORGE_API_KEY` environment variable. The key is sent only as the API authorization header to CurseForge endpoints and is never committed to the repository. CurseForge’s documentation describes a third-party service API covering games, categories, mod discovery, files, and fingerprints and directs third-party modding services to apply for a key.[2]

## Official account flow

The online profile flow is deliberately based on Microsoft’s device authorization grant. The user clicks sign in, receives a Microsoft verification URL and one-time code, completes sign-in in Microsoft’s browser page, and the launcher polls the token endpoint at the server-specified interval. Microsoft documents that this grant is designed for input-constrained public devices, returns access and refresh tokens after the user signs in, and requires clients to handle transient `authorization_pending` responses while polling.[3]

After the Microsoft token is acquired, the launcher calls the documented Xbox Live, XSTS, and Minecraft Services exchange endpoints, then requests the Minecraft Java profile and checks the entitlement endpoint before it considers a profile ready for online launch. Any failed entitlement result blocks the online launch and directs the user to use an owned account. A local account profile is presented only as an offline single-player/local-LAN profile and is never used to claim compatibility with authenticated servers.

## Security boundaries

> The launcher never accepts a Microsoft password, does not include a shared OAuth secret, does not bypass account ownership, and does not start an “online” session without a verified Minecraft Services token.

The UI distinguishes three states: **official account ready**, **sign-in required**, and **offline local profile**. The online launch action is disabled unless the official state is ready. Provider downloads use HTTPS and path-safe filenames. Configurations exclude tokens and API keys by default; a user can delete their stored account profile and local key at any time.

## References

[1] [Modrinth API overview](https://docs.modrinth.com/api/)

[2] [CurseForge API documentation](https://docs.curseforge.com/rest-api/)

[3] [Microsoft identity platform: OAuth 2.0 device authorization grant](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)
