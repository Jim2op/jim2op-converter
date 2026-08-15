# Converter

Converter is a **Node.js web application** with a static JavaScript frontend. The Node service manages file-conversion APIs, while small local Python workers use **yt-dlp** for YouTube jobs and **spotDL** for Spotify jobs. Flask is not used.

The browser interface is rendered by `static/app.js`. `server.js` serves the interface, manages conversion jobs, and starts `python/yt_dlp_worker.py` for YouTube requests or `python/spotify_worker.py` for Spotify requests. YouTube video URLs return one media file; playlist URLs download every available item and return the completed media as a ZIP archive.

## Requirements

Install the following software before running the app.

| Tool | Purpose |
|---|---|
| Node.js 20 or later | Runs the JavaScript server and frontend toolchain. |
| npm | Installs JavaScript dependencies; it is installed with Node.js. |
| Python 3.10 or later | Runs the local yt-dlp and spotDL download workers. |
| FFmpeg on the system PATH | Processes local video, GIF, audio, and downloader post-processing jobs. |
| spotDL | Resolves public Spotify tracks, albums, and playlists to matching audio and embeds tags and artwork. It is installed by `python -m pip install -r python\requirements.txt`. |

## Run locally on Windows

```powershell
# Open the repository folder.
cd C:\Users\Ibrah\OneDrive\Desktop\Documents\OnedriveProjects\Python\Converter

# Pull the current Node.js, yt-dlp, and spotDL integration.
git pull origin main

# Install Node.js dependencies.
npm install

# Install the Python downloader dependencies.
python -m pip install -r python\requirements.txt

# Start the Node.js development server.
npm run dev
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) on the same computer. The application is served by Node.js; do not run `python app.py`.

To run without automatic restarts, use:

```powershell
npm start
```

## yt-dlp cookies

The downloader looks for a **Netscape-format cookie export** in the project’s ignored `cookies` folder. Cookie values are never sent to the browser, logged, or committed to Git.

```text
Converter/
└── cookies/
    └── cookies.txt
```

The preferred filename is `cookies.txt`. `youtube-cookies.txt`, `youtube.txt`, or another `.txt` file in that folder are also recognized. If your cookies folder is elsewhere, set it for the current PowerShell session before starting the server:

```powershell
$env:YTDLP_COOKIES_DIRECTORY = "C:\Users\Ibrah\OneDrive\Desktop\Documents\OnedriveProjects\Python\Converter\cookies"
npm run dev
```

> A cookies folder is optional for public videos. Use cookies only from an account you control and keep the folder private.

## Application structure

| Location | Responsibility |
|---|---|
| `server.js` | Express server, local file conversion, API routes, YouTube and Spotify job management, and worker status bridges. |
| `python/yt_dlp_worker.py` | Python yt-dlp worker with JSON progress output, playlist ZIP packaging, and safe cookie-file selection. |
| `python/spotify_worker.py` | Python spotDL worker for Spotify tracks, albums, and playlists; it emits progress, preserves metadata and album art, and archives multi-track results. |
| `python/requirements.txt` | Python dependencies for the yt-dlp and spotDL workers. |
| `static/index.html` | Static application shell. |
| `static/app.js` | Client-side routes, UI state, previews, status feedback, and API requests. |
| `static/style.css` | Shared responsive light and dark UI styling. |
| `test/server.test.js` | Node.js tests for the static shell and API contract. |

## YouTube playlists

Paste either a video URL or a playlist URL into the YouTube tool. The selected MP4 or audio format and quality are applied to each playlist item, and the completed items are packaged into one ZIP download so the existing single-result job API remains reliable. Playlist downloads use the same cookie and 403 recovery flow as individual videos.

## Spotify downloads

The **Spotify** menu accepts public `track`, `album`, and `playlist` URLs from `open.spotify.com`. It exposes the same audio formats as the YouTube tool—**MP3, WAV, OGG, and M4A**—and the same 96–320 kbps output settings. spotDL locates matching audio from supported sources and embeds Spotify-derived tags and album artwork in the output; it does not download audio directly from Spotify.[1]

| Spotify link type | Result | Metadata and thumbnail handling |
|---|---|---|
| Track | One audio download | The file receives track metadata and embedded album art. |
| Album | ZIP archive containing all matched tracks | Each track carries its own metadata and album art. |
| Playlist | ZIP archive containing all matched tracks and `playlist.m3u8` | Each track receives metadata and artwork; playlist numbering is enabled. |

The Spotify page fetches public oEmbed details through the local server to preview the title, author, and thumbnail before the download begins. Cookie exports remain optional, but a valid YouTube Music Netscape-format cookie export can be used for supported higher-quality source access. Only download material you have the rights or permission to download.

## Tests

Run the JavaScript test suite with:

```powershell
npm test
```

## Access from another device

The server binds to all local network interfaces. Find your computer’s local IPv4 address with `ipconfig`, then open `http://YOUR-IP:5000` from another device on the same network. If Windows prompts for firewall access, allow Node.js on private networks.

## Troubleshooting a YouTube 403 response

A **403 Forbidden** response is usually caused by an outdated yt-dlp installation or a missing, expired, or incorrectly exported cookie file. Update the downloader first, then restart the Node server:

```powershell
python -m pip install --upgrade yt-dlp
npm run dev
```

If the 403 response remains, export **fresh cookies** from the browser account you use for YouTube in Netscape format and save the export as `cookies\cookies.txt`. Do not copy Chrome’s internal `Cookies` database file: yt-dlp requires a Netscape-format text export. The YouTube progress panel now indicates when it cannot find a valid export.

## References

[1] [spotDL usage documentation](https://spotdl.github.io/spotify-downloader/usage/)
