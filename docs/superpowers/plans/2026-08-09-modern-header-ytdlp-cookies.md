# Modern Header Theme Menu and yt-dlp Cookie Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header theme toggle with a compact Light/Dark/System dropdown and make the repository cookie file the default yt-dlp authentication source.

**Architecture:** Keep the existing Flask templates and shared static assets. Add one consistent Bootstrap dropdown markup pattern to each page, centralize theme state handling in `static/theme.js`, and resolve yt-dlp cookie paths in `app.py` before existing browser fallback logic.

**Tech Stack:** Flask, Jinja2, Bootstrap 5.3.2, vanilla JavaScript, CSS, yt-dlp, Python `unittest`.

## Global Constraints

- Resolve cookie paths in order: `YT_COOKIES_FILE`, `YTDLP_COOKIES`, then `APP_DIR / "cookies" / "cookies.txt"` when present.
- Do not log or expose cookie contents.
- Preserve explicit browser selection and local browser detection when no cookie file is available.
- No new frontend dependency beyond the already loaded Bootstrap bundle.
- Do not redesign conversion forms or change cookie contents.

---

### Task 1: Add default cookie-file resolution with tests

**Files:**
- Modify: `app.py:38-50`
- Modify: `tests/test_youtube_auth.py:18-54`

**Interfaces:**
- Consumes: existing `APP_DIR`, `YT_COOKIES_FILE`, `YTDLP_COOKIES`, and browser fallback helpers.
- Produces: `_build_ytdlp_auth_options()` returning `{"cookiefile": <path>}` for the repository-local cookie file when no environment override is set.

- [ ] **Step 1: Write the failing default-path test**

Add a test that clears cookie/browser environment variables, patches `app.os.path.isfile` to return true, and asserts the result is:

```python
{"cookiefile": os.path.join(str(app.APP_DIR), "cookies", "cookies.txt")}
```

Import `app` in the test module so the expected path uses the same platform separator as the implementation.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
python -m unittest tests.test_youtube_auth.YouTubeAuthOptionsTests.test_uses_repository_cookie_file_by_default -v
```

Expected: FAIL because the current helper returns browser options or `{}` when no environment cookie path exists.

- [ ] **Step 3: Implement ordered cookie-path resolution**

In `app.py`, resolve the environment override first, then use `APP_DIR / "cookies" / "cookies.txt"` (converted to a string) when it exists. Return `cookiefile` before checking `YT_BROWSER` or `_detect_browser_for_ytdlp`. Keep missing explicitly configured paths from silently falling through to browser detection, as covered by existing tests.

- [ ] **Step 4: Run the auth test module**

Run:

```powershell
python -m unittest tests.test_youtube_auth -v
```

Expected: all existing and new tests PASS.

- [ ] **Step 5: Commit if repository metadata becomes available**

```powershell
git add app.py tests/test_youtube_auth.py
git commit -m "feat: use repository cookies for yt-dlp"
```

If the workspace remains outside Git, leave the files uncommitted and report that limitation.

### Task 2: Replace duplicated header toggles with theme dropdown markup

**Files:**
- Modify: `templates/home.html:12-17`
- Modify: `templates/image.html:12-20`
- Modify: `templates/video.html:12-20`
- Modify: `templates/youtube.html:12-20`

**Interfaces:**
- Consumes: Bootstrap dropdown JavaScript already loaded by each page and the shared `theme.js` selectors.
- Produces: `#themeMenu`, `#themeMenuButton`, and `[data-theme-choice]` elements on every page, with existing navigation links preserved.

- [ ] **Step 1: Add the shared dropdown pattern to all four templates**

Use the same structure in each header, adapting only the existing page title and navigation links:

```html
<div class="dropdown">
  <button class="btn btn-sm btn-icon header-action" id="themeMenuButton"
          type="button" data-bs-toggle="dropdown" aria-expanded="false"
          aria-label="Choose color theme" title="Choose color theme">
    <span aria-hidden="true">◐</span>
  </button>
  <ul class="dropdown-menu dropdown-menu-end" id="themeMenu" aria-labelledby="themeMenuButton">
    <li><button class="dropdown-item" type="button" data-theme-choice="light">Light</button></li>
    <li><button class="dropdown-item" type="button" data-theme-choice="dark">Dark</button></li>
    <li><button class="dropdown-item" type="button" data-theme-choice="system">System</button></li>
  </ul>
</div>
```

Keep the navigation links keyboard-accessible and place the dropdown beside them inside the existing flex container. Do not retain a clickable `#themeToggle`.

- [ ] **Step 2: Inspect template hooks**

Run:

```powershell
rg -n "themeMenu|themeMenuButton|data-theme-choice|themeToggle" templates
```

Expected: all four templates contain the new menu hooks; no template contains `themeToggle`.

### Task 3: Implement persisted Light/Dark/System theme behavior

**Files:**
- Modify: `static/theme.js`
- Modify: `static/style.css`

**Interfaces:**
- Consumes: `#themeMenuButton`, `#themeMenu`, and `[data-theme-choice]` from templates.
- Produces: `data-theme` and `data-bs-theme` on `<html>`, persisted explicit choices, system preference tracking, and selected menu state.

- [ ] **Step 1: Update theme state logic**

Use `converter-theme` for explicit values `light` and `dark`; treat `system` as the absence of a stored override. Resolve the active theme from the stored choice or `matchMedia('(prefers-color-scheme: dark)')`. On each apply:

```javascript
document.documentElement.dataset.theme = activeTheme;
document.documentElement.dataset.bsTheme = activeTheme;
document.querySelectorAll('[data-theme-choice]').forEach((item) => {
  item.classList.toggle('active', item.dataset.themeChoice === selectedTheme);
  item.setAttribute('aria-checked', String(item.dataset.themeChoice === selectedTheme));
});
```

Update the button title/aria-label to include the selected mode. A Light/Dark choice stores its value; System removes the key and immediately applies the media-query result.

- [ ] **Step 2: Add modern shared header styles**

In `static/style.css`, style `.header-bar` with a subtle shadow and appropriate backdrop treatment, style `.header-action` as a compact rounded icon control, and ensure dropdown colors/borders follow `--app-card-bg`, `--app-text`, and `--app-border` in both themes. Preserve existing page accent variables and button behavior.

- [ ] **Step 3: Run static hook checks**

Run:

```powershell
rg -n "themeMenu|themeMenuButton|data-theme-choice|converter-theme|header-action" static templates
```

Expected: the shared JavaScript and CSS selectors are present, and all four templates use the new hooks.

### Task 4: Run focused verification and smoke checks

**Files:**
- Test: `tests/test_youtube_auth.py`
- Verify: `app.py`, `static/theme.js`, `static/style.css`, and all templates

**Interfaces:**
- Consumes: completed cookie resolution and theme menu changes.
- Produces: verified unit tests and a renderable Flask application.

- [ ] **Step 1: Run the complete focused test suite**

```powershell
python -m unittest discover -s tests -v
```

Expected: all discovered tests PASS.

- [ ] **Step 2: Check Python syntax**

```powershell
python -m py_compile app.py
```

Expected: command exits successfully.

- [ ] **Step 3: Smoke-test template rendering**

```powershell
python -c "from app import app; client = app.test_client(); assert client.get('/').status_code == 200; assert client.get('/image').status_code == 200; assert client.get('/video').status_code == 200; assert client.get('/youtube').status_code == 200"
```

Expected: command exits successfully with all four pages rendering.

- [ ] **Step 4: Confirm cookie contents were not read into output**

Inspect only source references:

```powershell
rg -n "cookiefile|cookies.txt|YT_COOKIES_FILE|YTDLP_COOKIES" app.py tests
```

Expected: paths/options are referenced, but cookie values are never printed or logged.
