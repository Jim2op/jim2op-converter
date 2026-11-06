# Expo Go Client — Design

**Date:** 2026-11-06
**Status:** Draft for review

## Goal

Move the Converter interface off Manus and onto an Expo app that opens in **Expo Go** on a phone. This is for development and testing only; no store build, no web hosting, no EAS Build.

## What the user asked for

- Transfer the Converter from Manus to Expo.
- It must work with Expo Go.
- Scope is development builds and testing.
- Server-only tools (YouTube, Spotify, video) are handled by calling the Converter server on the user's PC.

## Assumptions (confirm or correct)

- The phone and PC are on the same Wi-Fi network. The app reaches the PC by its LAN address (e.g. `http://192.168.1.20:5000`).
- The existing Node server (`server.js`) and its API stay as they are; the Expo app is a new client for it, next to the existing browser UI in `static/`.
- The Manus apps (`hosted-manus-app/` and the `manus-web-app` branch) are reference material only; no Manus code, auth, tRPC, database or hosting is carried over.

## Out of scope

- App Store / Play Store builds, EAS Build, EAS Hosting, Expo web export.
- Reaching the PC from outside the home network (a tunnel can be added later).
- On-device conversion. Every job goes to the server, which already supports every format.
- Accounts, history or a job queue on the phone.

## Architecture

```
Phone (Expo Go)                          PC
┌────────────────────────┐   HTTP/LAN   ┌───────────────────────────┐
│ expo-app/ (Expo Router) │ ───────────▶ │ server.js (port 5000)     │
│  screens → api client   │ ◀─────────── │  sharp / FFmpeg / workers │
└────────────────────────┘              └───────────────────────────┘
```

- **Location:** new top-level `expo-app/` folder in this repo, with its own `package.json`. The root Node app is untouched apart from a README section.
- **SDK:** the Expo SDK installed by `create-expo-app@latest` on the day of setup, which must match the Expo Go version on the phone. TypeScript, Expo Router.
- **Libraries:** only Expo Go–compatible modules: `expo-router`, `expo-image-picker` (images and videos from the library), `expo-file-system` (saving downloads), `expo-sharing` (share sheet), `expo-media-library` (save images/videos/audio to the phone), `@react-native-async-storage/async-storage` (remember the server address). No custom native code.

## Screens

| Screen | What it does | Server routes |
|---|---|---|
| **Home** | Four tool cards plus a server-address field with a "Test connection" button. Shows whether the server is reachable and whether YouTube cookies are configured. | `GET /api/config` |
| **Image** | Pick an image, choose an output format from the server's list, convert, then save or share the result. | `POST /api/convert` (fields `image`, `format`) |
| **Video** | Pick a video, choose GIF / MP3 / WAV / OGG / M4A, convert, save or share. | `POST /api/convert` |
| **YouTube** | Paste a video or playlist URL, choose MP4 or an audio format and quality, start, watch progress, then save or share the file or ZIP. | `POST /api/youtube/download`, `GET /api/youtube/progress/:id`, `GET /api/youtube/result/:id` |
| **Spotify** | Paste a track/album/playlist URL, show the preview (title, cover), choose format and quality, start, watch progress (track count, current track, elapsed), then save or share. | `GET /api/spotify/preview`, `POST /api/spotify/download`, `GET /api/spotify/progress/:id`, `GET /api/spotify/result/:id` |

Format and quality choices come from `GET /api/config`, so the app never drifts from the server.

## Units

- `src/api/client.ts` — the only code that talks to the server: base URL, `getConfig`, `convertFile`, `startJob`, `pollJob`, `downloadResult`. Turns non-2xx JSON `{ error }` responses into thrown errors carrying the server's message.
- `src/api/useJob.ts` — hook that starts a YouTube/Spotify job, polls progress every 2 s, stops on `completed` or `failed`, and exposes state to the screen.
- `src/settings/serverAddress.ts` — loads and saves the server address in AsyncStorage; validates that it looks like `http(s)://host:port`.
- `src/files/saveResult.ts` — writes a downloaded result into the app's cache, then offers "Save to phone" (photo library, for images and video) and "Share" (share sheet; the only option for audio and ZIPs, which the photo library does not accept).
- `app/` — one Expo Router file per screen; screens hold UI state only and call the units above.

## Data flow

1. On launch the app loads the saved server address and calls `/api/config`. If that fails, every tool screen shows "Can't reach the server" with the address and a link back to Home.
2. File tools upload with `multipart/form-data` plus `deliver=link`, then download the one-time result link into the cache with `expo-file-system`.
3. Download tools start a job, poll until it finishes, then fetch the result once. The server deletes a result after it is fetched, so the app downloads it to the cache immediately and saves or shares from there.

## Server change

Two additions to `server.js`, both backwards compatible with the browser app: job progress includes `filename` once a job completes, so the app can name the downloaded result (the result route deletes the file after one fetch); and `POST /api/convert` accepts `deliver=link`, returning `201 { result_url, filename }` for a one-time `GET /api/convert/result/:id`, so large conversion results download straight to the phone's disk instead of through JavaScript memory. React Native requests are not subject to browser CORS, and Expo Go allows plain-HTTP requests to LAN addresses. The README gains an "Expo Go" section: start the server, find the PC's IPv4 address with `ipconfig`, allow Node through the Windows firewall on private networks, run `npx expo start` in `expo-app/`, scan the QR code, and enter the server address on Home.

## Error handling

- Unreachable server: a clear banner with the configured address and the same-Wi-Fi / firewall hint.
- Server-side errors: show the server's `error` message unchanged (it already contains recovery guidance for 403s, blocked Spotify matches and missing spotDL).
- `cookiesIssue` from progress responses is shown under the progress bar, as on the web UI.
- A cancelled picker does nothing; a denied media-library permission falls back to "Share" without an error.

## Testing

- **Unit (Jest, `jest-expo` preset):** `client.ts` against a mocked `fetch` (config parsing, error-message passthrough, multipart body shape); `useJob` polling and stop conditions with fake timers; server-address validation.
- **Manual in Expo Go (checklist in the plan):** connection test; PNG→JPEG; video→MP3; a short YouTube MP4 and MP3; a Spotify track; a small Spotify playlist ZIP saved through the share sheet; stopping the server mid-way shows the unreachable banner.
- The existing root `npm test` and Python tests must keep passing.

## Known limits

- Large uploads and long playlists need the phone to stay awake with the app open.
- BMP image conversion currently fails on the server (sharp lacks BMP support); the app will show that error until the server is fixed separately.
