# Mod-platform API notes

## Modrinth

The current official API overview identifies the production Labrinth API as version 2.7.0 and exposes project search, project detail, project-version, version-file, loader-tag, and game-version-tag operations. A launcher can use those operations to find compatible mod versions and obtain the file metadata needed to download them. Public project discovery does not require a user credential; Modrinth documents separate token and OAuth options for authenticated user actions.

Source: https://docs.modrinth.com/api/ (viewed 2026-08-18)

## CurseForge

CurseForge’s official documentation is aimed at third-party mod services and exposes games, categories, mod search, mod detail, files, and fingerprints endpoints. Its introduction explicitly directs third-party modding services to apply for an API key, so this launcher must treat CurseForge as an opt-in integration configured with the operator’s own approved key rather than embedding a shared secret.

Source: https://docs.curseforge.com/rest-api/ (viewed 2026-08-18)

## Product implication

The launcher should implement Modrinth browsing and downloads as a working public integration. CurseForge browsing/downloads should use an externally supplied API key and show a clear configuration status when the key is absent, invalid, or unapproved. Neither integration substitutes for official Minecraft account ownership or server authentication.
