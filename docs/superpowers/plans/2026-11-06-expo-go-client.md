# Expo Go Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `expo-app/` that runs in Expo Go and drives the existing Converter server (image, video, YouTube, Spotify) over the home Wi-Fi.

**Architecture:** Expo Router app with five screens. All network calls go through one client module; job polling lives in one hook; file saving/sharing in one module. The server gains one field (`filename`) in job progress so the app can name downloads.

**Tech Stack:** Expo SDK 58 (`expo@58`, `expo-router@58`), TypeScript, `expo-image-picker`, `expo-file-system` (new `File`/`Paths` API), `expo-sharing`, `expo-media-library`, `@react-native-async-storage/async-storage`, Jest with `jest-expo`, `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-11-06-expo-go-client-design.md`

## Global Constraints

- Expo SDK 58; the phone's Expo Go must be the SDK 58 build (update it from the store first).
- Expo Go–compatible modules only, installed with `npx expo install` (never plain `npm install` for Expo modules). No custom native code, no EAS.
- All server calls go through `expo-app/src/api/client.ts`.
- Show the server's `error` text unchanged.
- Progress polling interval: 2000 ms.
- Default server address placeholder: `http://192.168.1.20:5000`.
- Root `npm test` and `python -m unittest discover -s test -p "*_worker_test.py"` keep passing.
- After each task: commit, push to `origin/main`, fast-forward the local main checkout (user rule).

## Review Focus

1. Server address typed as `192.168.1.20:5000`, with spaces, or with a trailing `/` → normalized to `http://192.168.1.20:5000` (Task 3 test).
2. Wrong port or another app answers with HTML / non-JSON error → message `Server responded with <status>`, no JSON parse crash (Task 4 test).
3. Server restarted mid-job, progress returns 404 → polling stops with `The server lost this job. Was it restarted?` (Task 5 test).
4. User leaves the screen while a job is polling → polling stops on unmount, no state updates afterwards (Task 5 test).
5. `Content-Disposition` with `filename*=UTF-8''…` or spaces → decoded filename used (Task 4 test).

---

### Task 1: Server exposes the result filename

**Files:**
- Modify: `server.js:117-131` (`publicJob`)
- Test: `test/server.test.js`
- Modify: `docs/superpowers/specs/2026-11-06-expo-go-client-design.md` ("Server change" section: one field added)

**Interfaces:**
- Produces: progress JSON gains `filename: string | null` — the job's filename when `state === 'completed'`, else `null`.

- [ ] **Step 1: Write the failing test** — in the existing Spotify track and YouTube playlist tests, after `waitForCompletion`, add `assert.equal(typeof progress.filename, 'string'); assert.ok(progress.filename.length > 0);`. Add one assertion to an in-progress read that `filename` is `null` while `state !== 'completed'` (reuse the first progress poll in the yt-dlp progress test).
- [ ] **Step 2: Run** `npm test` → the new assertions FAIL (`undefined`).
- [ ] **Step 3: Implement** `filename: job.state === 'completed' ? job.filename || null : null` in `publicJob`.
- [ ] **Step 4: Run** `npm test` from the main checkout → 11 pass (the `.claude` worktree path makes the shell-route test 404 inside a worktree; run there or accept that single known failure).
- [ ] **Step 5: Commit** `feat: include result filename in job progress`, push, sync local.

### Task 2: Scaffold `expo-app/`

**Files:**
- Create: `expo-app/` via `npx create-expo-app@latest expo-app --template blank-typescript`
- Modify: `expo-app/package.json` (`"main": "expo-router/entry"`, scripts `test: jest`, `typecheck: tsc --noEmit`, `jest.preset: "jest-expo"`)
- Modify: `expo-app/app.json` (`name: "Converter"`, `slug: "jim2op-converter"`, `scheme: "converter"`, `plugins: ["expo-router"]`)
- Create: `expo-app/app/_layout.tsx` (Stack), `expo-app/app/index.tsx` (placeholder "Converter")
- Delete: `expo-app/App.tsx`, `expo-app/index.ts`
- Test: `expo-app/src/__tests__/smoke.test.ts`

- [ ] **Step 1:** Scaffold, then `npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar expo-image-picker expo-file-system expo-sharing expo-media-library @react-native-async-storage/async-storage` and `npx expo install -- --save-dev jest-expo jest @types/jest @testing-library/react-native`.
- [ ] **Step 2:** Smoke test `expect(1 + 1).toBe(2)`; run `npm test` in `expo-app` → PASS.
- [ ] **Step 3:** `npx expo-doctor` → no failed checks; `npm run typecheck` → no errors.
- [ ] **Step 4:** `npx expo start` boots and prints a QR code (stop it after).
- [ ] **Step 5: Commit** `feat: scaffold Expo Go client` (make sure `expo-app/node_modules` and `.expo/` are ignored), push, sync local.

### Task 3: Server address settings

**Files:**
- Create: `expo-app/src/settings/serverAddress.ts`
- Test: `expo-app/src/settings/__tests__/serverAddress.test.ts`

**Interfaces:**
- Produces: `normalizeServerAddress(input: string): string | null`; `loadServerAddress(): Promise<string | null>`; `saveServerAddress(address: string): Promise<void>` (AsyncStorage key `converter.serverAddress`).

- [ ] **Step 1: Tests:**
  - `normalizeServerAddress(' 192.168.1.20:5000/ ')` → `'http://192.168.1.20:5000'`
  - `normalizeServerAddress('https://abc.trycloudflare.com')` → `'https://abc.trycloudflare.com'`
  - `normalizeServerAddress('')`, `'not a url'`, `'ftp://x:1'` → `null`
  - save then load round-trips (use the AsyncStorage jest mock `@react-native-async-storage/async-storage/jest/async-storage-mock`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (prepend `http://` when no scheme; accept only http/https with a host; strip trailing slashes; parse with `URL`). **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: store and validate the server address`, push, sync local.

### Task 4: API client

**Files:**
- Create: `expo-app/src/api/types.ts`, `expo-app/src/api/client.ts`
- Test: `expo-app/src/api/__tests__/client.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `ServerConfig = { image_formats: string[]; video_outputs: string[]; youtube_video_qualities: string[]; youtube_audio_qualities: string[]; spotify_audio_qualities: string[]; youtube_cookies_configured: boolean }`
  - `JobKind = 'youtube' | 'spotify'`
  - `JobProgress = { state: 'queued' | 'downloading' | 'finalizing' | 'completed' | 'failed' | string; progress: number; speed: string | null; eta: string | null; elapsed: number; error: string | null; cookiesIssue: string | null; completedItems: number; totalItems: number | null; currentItem: string | null; message: string | null; filename: string | null }`
  - `SpotifyPreview = { title: string | null; author: string | null; thumbnail_url: string | null }`
  - `PickedFile = { uri: string; name: string; mimeType: string }`
- Produces (`client.ts`): `class ServerError extends Error { status: number }`; `createClient(baseUrl: string, fetchImpl: typeof fetch = fetch)` returning
  - `getConfig(): Promise<ServerConfig>` — `GET /api/config`
  - `convertFile(file: PickedFile, format: string): Promise<{ bytes: Uint8Array; filename: string }>` — `POST /api/convert`, FormData fields `image` (`{ uri, name, type }`) and `format`; filename from `Content-Disposition`
  - `startJob(kind: JobKind, url: string, format: string, quality: string): Promise<string>` — urlencoded body with `youtube_url` or `spotify_url`, `format`, `quality`; returns `job_id`
  - `getProgress(kind: JobKind, jobId: string): Promise<JobProgress>`
  - `getSpotifyPreview(url: string): Promise<SpotifyPreview>`
  - `resultUrl(kind: JobKind, jobId: string): string`
  - Also export `filenameFromDisposition(header: string | null, fallback: string): string`.

- [ ] **Step 1: Tests** (mock `fetchImpl` with `jest.fn` returning `new Response(...)`):
  - `getConfig` hits `http://h:5000/api/config` and returns the parsed body.
  - Non-2xx JSON `{ error: 'Unsupported file type.' }`, status 400 → rejects `ServerError` with that message and `status === 400`.
  - Non-2xx HTML body, status 404 → rejects with `'Server responded with 404'`.
  - Network failure (`fetchImpl` rejects) → rejects with `"Can't reach the server at http://h:5000"`.
  - `startJob('spotify', u, 'MP3', '320')` sends body `spotify_url=...&format=MP3&quality=320` with `Content-Type: application/x-www-form-urlencoded` and returns the `job_id`.
  - `convertFile` sends a `FormData` containing `image` and `format`; returns `bytes` from `arrayBuffer()` and `filename` `'photo.jpg'` from `attachment; filename="photo.jpg"`.
  - `filenameFromDisposition("attachment; filename*=UTF-8''my%20song.mp3", 'x')` → `'my song.mp3'`; `filenameFromDisposition(null, 'x.zip')` → `'x.zip'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: add Converter API client`, push, sync local.

### Task 5: Job hook

**Files:**
- Create: `expo-app/src/api/useJob.ts`
- Test: `expo-app/src/api/__tests__/useJob.test.ts`

**Interfaces:**
- Consumes: `createClient` return type (Task 4), `JobKind`, `JobProgress`.
- Produces: `useJob(deps: { client: Client; kind: JobKind; download: (url: string, filename: string) => Promise<string>; intervalMs?: number })` returning `{ phase: 'idle' | 'running' | 'downloading' | 'done' | 'failed'; progress: JobProgress | null; error: string | null; result: { uri: string; filename: string } | null; start(url: string, format: string, quality: string): Promise<void>; reset(): void }`. `Client = ReturnType<typeof createClient>` exported from `client.ts`.

- [ ] **Step 1: Tests** (`renderHook` + `jest.useFakeTimers()`, fake client):
  - Progress sequence `queued → downloading → completed(filename 'a.zip')` → `download` called once with `resultUrl(...)` and `'a.zip'`; ends `phase 'done'`, `result.uri` from `download`.
  - `state: 'failed', error: 'YouTube blocked…'` → `phase 'failed'`, `error` equals that text, no further polls.
  - `getProgress` rejects `ServerError` status 404 → `phase 'failed'`, `error 'The server lost this job. Was it restarted?'`.
  - Unmount after first poll → advancing timers makes no more `getProgress` calls.
  - `filename` null on completion → falls back to `${kind}-download`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (setTimeout chain, cleared on unmount and `reset`). **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: add job polling hook`, push, sync local.

### Task 6: Saving and sharing results

**Files:**
- Create: `expo-app/src/files/saveResult.ts`
- Test: `expo-app/src/files/__tests__/saveResult.test.ts`

**Interfaces:**
- Produces: `canSaveToPhotos(filename: string): boolean` (true for `.png .jpg .jpeg .gif .webp .mp4 .mov`; false for audio, `.zip`, `.tiff`, `.avif`, `.bmp`); `downloadToCache(url: string, filename: string): Promise<string>` (`File.downloadFileAsync` into `new File(Paths.cache, filename)`, replacing an existing file); `writeBytesToCache(bytes: Uint8Array, filename: string): Promise<string>`; `saveToPhotos(uri: string): Promise<boolean>` (`MediaLibrary.requestPermissionsAsync(true)`; returns false when denied); `shareFile(uri: string): Promise<void>`.

- [ ] **Step 1: Tests** for `canSaveToPhotos` covering each listed extension and uppercase `PHOTO.JPG`; `saveToPhotos` returns `false` without calling `saveToLibraryAsync` when the mocked permission is `denied`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: save and share converted files`, push, sync local.

### Task 7: Server context and Home screen

**Files:**
- Create: `expo-app/src/settings/ServerContext.tsx`, `expo-app/src/ui/theme.ts`, `expo-app/src/ui/ServerBanner.tsx`
- Modify: `expo-app/app/_layout.tsx`, `expo-app/app/index.tsx`

**Interfaces:**
- Consumes: Task 3, Task 4.
- Produces: `ServerProvider`; `useServer(): { address: string | null; client: Client | null; config: ServerConfig | null; status: 'unset' | 'checking' | 'online' | 'offline'; error: string | null; setAddress(input: string): Promise<boolean>; refresh(): Promise<void> }`; `<ServerBanner />` renders nothing when online, otherwise the address, the error, and "Same Wi-Fi as the PC? Node allowed through Windows Firewall?" with a link to Home.
- Home: address field (placeholder `http://192.168.1.20:5000`), **Test connection** button, status line (online / offline + error / cookies configured yes-no), four tool cards linking `/image`, `/video`, `/youtube`, `/spotify`. Light and dark via `useColorScheme`.

- [ ] **Step 1:** Implement; `npm run typecheck` → clean; `npm test` → all pass.
- [ ] **Step 2:** In Expo Go: enter the PC address, **Test connection** shows online; a wrong port shows offline with the banner text.
- [ ] **Step 3: Commit** `feat: add Home screen and server connection`, push, sync local.

### Task 8: Tool screens

**Files:**
- Create: `expo-app/src/ui/OptionPicker.tsx` (row of selectable chips: `options: string[]; value: string; onChange(v)`), `expo-app/src/ui/ProgressCard.tsx` (bar, percent, message, `completedItems/totalItems`, current item, elapsed, `cookiesIssue`), `expo-app/src/ui/ResultActions.tsx` (`uri`, `filename`: **Save to phone** only when `canSaveToPhotos`, **Share** always; on denied permission falls back to Share)
- Create: `expo-app/app/image.tsx`, `expo-app/app/video.tsx`, `expo-app/app/youtube.tsx`, `expo-app/app/spotify.tsx`

**Interfaces:**
- Consumes: `useServer` (Task 7), `useJob` (Task 5), `writeBytesToCache` / `downloadToCache` (Task 6), `client.convertFile`, `client.getSpotifyPreview`.
- Screen rules: formats from `config.image_formats` / `config.video_outputs`; YouTube formats `['MP4', 'MP3', 'WAV', 'OGG', 'M4A']` with qualities `youtube_video_qualities` for MP4 else `youtube_audio_qualities` (defaults `720` / `192`); Spotify formats `['MP3', 'WAV', 'OGG', 'M4A']`, qualities `spotify_audio_qualities`, default `192`. Image/video pickers use `ImagePicker.launchImageLibraryAsync` with `mediaTypes` `['images']` / `['videos']`; cancel does nothing. Spotify preview fetched 500 ms after the URL stops changing, shown as cover + title. Every screen shows `<ServerBanner />` and disables its start button while offline or busy.

- [ ] **Step 1:** Implement; `npm run typecheck` → clean; `npm test` → all pass.
- [ ] **Step 2: Manual Expo Go checklist** (server running on the PC):
  - Image: PNG → JPEG, save to phone.
  - Video: a short clip → MP3, share.
  - YouTube: `https://www.youtube.com/watch?v=jNQXAC9IVRw` as MP4 360 and MP3 128.
  - Spotify: a track shows its preview and downloads as MP3; a small playlist returns a ZIP that opens the share sheet.
  - Stop the server mid-job → the job fails with the lost-job message and the banner appears.
- [ ] **Step 3: Commit** `feat: add image, video, YouTube and Spotify screens`, push, sync local.

### Task 9: Docs

**Files:**
- Modify: `README.md` (new "Expo Go app" section after "Access from another device")

- [ ] **Step 1:** Write the section: update Expo Go to the SDK 58 build; `npm run dev` at the root; `ipconfig` for the IPv4 address; allow Node on private networks; `cd expo-app`, `npm install`, `npx expo start`; scan the QR code (Expo Go on Android, Camera on iOS); enter `http://YOUR-IP:5000` on Home. Add `cd expo-app; npm test` to the Tests section.
- [ ] **Step 2:** Run root `npm test` and the Python tests → pass; `expo-app` `npm test` → pass.
- [ ] **Step 3: Commit** `docs: explain running the Expo Go app`, push, sync local.
