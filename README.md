# Converter Manus Web App

This Manus web app preserves the original Converter HTML shell, typography, navigation, CSS variables, theme control, and client-side interaction model. The original static client is served unchanged as durable project assets, while the managed Manus Express server supplies the existing conversion and downloader route contract.

## Media API contract

| Tool | Routes | Server behavior |
|---|---|---|
| Images and video/audio | `POST /api/convert` | Accepts multipart uploads, uses Sharp for supported image formats, and uses FFmpeg for video/audio extraction and BMP output. |
| YouTube | `/api/youtube/download`, `/api/youtube/progress/:jobId`, `/api/youtube/result/:jobId` | Starts `workers/yt_dlp_worker.py`, forwards JSON progress records, and returns a single file or playlist ZIP result. |
| Spotify | `/api/spotify/preview`, `/api/spotify/download`, `/api/spotify/progress/:jobId`, `/api/spotify/result/:jobId` | Proxies public oEmbed preview metadata, starts `workers/spotify_worker.py`, forwards current-track and per-track counts, and returns audio or a playlist ZIP archive. |

## Runtime requirements

The production image uses the root `Dockerfile` because this application needs a Node server, Python workers, and FFmpeg. It installs the Python dependencies in `workers/requirements.txt`, including `yt-dlp` and `spotDL`. The Node server listens on the platform-provided `PORT` through the Manus Express bootstrap; browser clients do not invoke Python directly.

The default Autoscale runtime provides **1 vCPU**, **512 MiB** of memory, and a **180-second request limit** for active requests. Media conversions and downloader jobs are therefore intended for reasonably sized files and short-to-medium downloads. For lengthy or heavy transcoding workloads, use a local instance or a more suitable persistent environment rather than relying on in-memory temporary storage.[1]

## Validation

Run the complete verification suite with:

```bash
pnpm check
pnpm test
pnpm build
```

The route suite covers the preserved configuration contract, multipart image conversion, downloader validation, worker-driven YouTube result flow, and Spotify playlist progress with current-item status and a ZIP result.

## References

[1] [Manus custom Dockerfile runtime envelope](../skills/webdev-custom-dockerfile/SKILL.md)
