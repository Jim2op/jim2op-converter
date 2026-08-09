# Modern Header Theme Menu and yt-dlp Cookie Configuration

## Scope

Modernize the shared header across the home, image, video, and YouTube pages by replacing the direct theme toggle with a compact responsive theme menu. Ensure YouTube downloads pass the repository's `cookies\cookies.txt` to yt-dlp by default while preserving environment-variable overrides and browser fallback behavior.

## Design

### Header and theme behavior

- Keep the existing Bootstrap navbar and page navigation.
- Replace each `#themeToggle` button with a compact icon button that opens a Bootstrap dropdown.
- Provide Light, Dark, and System choices.
- Persist explicit Light/Dark choices in `localStorage`; System removes the override and follows `prefers-color-scheme`.
- Update the menu's accessible label and selected state whenever the active theme changes.
- Use shared markup and CSS across all templates so navigation remains consistent and responsive.
- Add subtle modern styling (rounded controls, improved spacing, restrained translucency/shadow) without changing the page forms or color accents.

### yt-dlp authentication

- Resolve cookie paths in this order:
  1. `YT_COOKIES_FILE`
  2. `YTDLP_COOKIES`
  3. `APP_DIR / "cookies" / "cookies.txt"` when the file exists
- Pass an existing resolved file as yt-dlp's `cookiefile` option.
- If no cookie file is available, retain the existing explicit browser selection and local browser detection behavior.
- Do not log or expose cookie contents.
- Preserve current actionable error guidance for missing or expired authentication.

### Testing and validation

- Extend the existing YouTube auth unit tests to verify the repository-local default cookie path and preserve environment override behavior.
- Run the focused Python unit test module.
- Perform a template/static inspection to confirm every page has the shared dropdown hooks and no direct theme-toggle-only behavior remains.
- Run a lightweight Flask/template smoke check if the project already supports it; do not add new tooling.

## Non-goals

- No redesign of conversion forms or download workflows.
- No change to cookie contents or cookie extraction.
- No new frontend dependency beyond the already loaded Bootstrap bundle.
