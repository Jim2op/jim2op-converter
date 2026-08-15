# Converter

Converter is a **Node.js web application** with a static JavaScript frontend. The Node service manages file-conversion APIs, while a small local Python worker uses **yt-dlp** for YouTube download jobs. Flask is not used.

The browser interface is rendered by `static/app.js`. `server.js` serves the interface, manages conversion jobs, and starts `python/yt_dlp_worker.py` only for YouTube requests.

## Requirements

Install the following software before running the app.

| Tool | Purpose |
|---|---|
| Node.js 20 or later | Runs the JavaScript server and frontend toolchain. |
| npm | Installs JavaScript dependencies; it is installed with Node.js. |
| Python 3.10 or later | Runs the local yt-dlp worker for YouTube download jobs. |
| FFmpeg on the system PATH | Processes local video, GIF, audio, and yt-dlp post-processing jobs. |

## Run locally on Windows

```powershell
# Open the repository folder.
cd C:\Users\Ibrah\OneDrive\Desktop\Documents\OnedriveProjects\Python\Converter

# Pull the current Node.js and yt-dlp integration.
git pull origin main

# Install Node.js dependencies.
npm install

# Install the Python downloader dependency.
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
| `server.js` | Express server, local file conversion, API routes, yt-dlp job management, and worker status bridge. |
| `python/yt_dlp_worker.py` | Python yt-dlp worker with JSON progress output and safe cookie-file selection. |
| `python/requirements.txt` | Python dependency for the yt-dlp worker. |
| `static/index.html` | Static application shell. |
| `static/app.js` | Client-side routes, UI state, previews, status feedback, and API requests. |
| `static/style.css` | Shared responsive light and dark UI styling. |
| `test/server.test.js` | Node.js tests for the static shell and API contract. |

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
