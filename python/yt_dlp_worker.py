"""Run one yt-dlp job and report machine-readable progress to the Node.js server."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any

import yt_dlp

AUDIO_CODECS = {"MP3": "mp3", "WAV": "wav", "OGG": "vorbis", "M4A": "m4a"}


def emit(payload: dict[str, Any]) -> None:
    """Write a single JSON progress record for the Node.js parent process."""
    print(json.dumps(payload), flush=True)


def clean_title(title: str) -> str:
    """Return a conservative filename stem when yt-dlp metadata lacks a title."""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", title).strip("._")[:100] or "youtube-download"


def is_netscape_cookie_export(cookie_file: Path) -> bool:
    """Verify the file resembles a browser-exported Netscape cookie jar, not a browser database."""
    try:
        with cookie_file.open("r", encoding="utf-8", errors="ignore") as handle:
            for _ in range(12):
                line = handle.readline()
                if not line:
                    break
                stripped = line.strip()
                if not stripped:
                    continue
                if "Netscape HTTP Cookie File" in stripped or "HTTP Cookie File" in stripped:
                    return True
                # Valid Netscape records have seven tab-delimited fields; no cookie values are retained.
                if stripped.count("\t") >= 6:
                    return True
    except OSError:
        return False
    return False


def find_cookie_file(cookies_directory: str | None) -> tuple[Path | None, str | None]:
    """Select a valid Netscape-format export without reading or logging cookie contents."""
    if not cookies_directory:
        return None, "No cookies directory was configured."
    directory = Path(cookies_directory)
    if not directory.is_dir():
        return None, "Cookies folder was not found."

    preferred_names = ("cookies.txt", "youtube-cookies.txt", "youtube.txt")
    candidates = [directory / name for name in preferred_names]
    candidates.extend(sorted(directory.glob("*.txt")))
    for candidate in candidates:
        if candidate.is_file() and is_netscape_cookie_export(candidate):
            return candidate, None
    return None, "No valid Netscape-format cookies.txt export was found."


def friendly_error(error: Exception, cookie_file: Path | None, cookie_issue: str | None) -> str:
    """Turn common downloader failures into recovery steps without exposing private cookie data."""
    message = str(error).strip() or "yt-dlp could not complete the download."
    if "403" in message or "Forbidden" in message:
        if cookie_file:
            return (
                "YouTube returned 403 Forbidden. Update yt-dlp, then replace cookies.txt with a fresh "
                "Netscape-format export from the same browser account. Existing cookies may be expired."
            )
        return (
            "YouTube returned 403 Forbidden. Update yt-dlp and add a fresh Netscape-format cookies.txt "
            "export to the project cookies folder, then restart the Node server."
        )
    if cookie_issue and "cookie" in message.lower():
        return f"{message} {cookie_issue}"
    return message


def options_for(args: argparse.Namespace, cookie_file: Path | None, output_directory: Path) -> dict[str, Any]:
    """Build yt-dlp options that accept either a single video or a complete playlist."""
    output_directory.mkdir(parents=True, exist_ok=True)
    options: dict[str, Any] = {
        "outtmpl": str(output_directory / "%(title).180B-%(id)s.%(ext)s"),
        # A playlist is intentionally retained; the worker packages its completed items below.
        "noplaylist": False,
        "restrictfilenames": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 3,
        "fragment_retries": 3,
        "extractor_retries": 3,
        "concurrent_fragment_downloads": 1,
        "progress_hooks": [progress_hook],
        "merge_output_format": "mp4",
    }
    if cookie_file:
        options["cookiefile"] = str(cookie_file)

    if args.format == "MP4":
        options["format"] = (
            f"bestvideo[height<={args.quality}][ext=mp4]+bestaudio[ext=m4a]/"
            f"best[height<={args.quality}][ext=mp4]/best[ext=mp4]/best"
        )
    else:
        codec = AUDIO_CODECS[args.format]
        options["format"] = "bestaudio/best"
        options["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": codec,
            "preferredquality": args.quality,
        }]
    return options


def progress_hook(status: dict[str, Any]) -> None:
    """Translate yt-dlp hook data to a stable progress contract for the browser."""
    state = status.get("status")
    if state == "downloading":
        downloaded = status.get("downloaded_bytes") or 0
        total = status.get("total_bytes") or status.get("total_bytes_estimate") or 0
        progress = round((downloaded / total) * 82, 1) if total else 0
        emit({
            "event": "progress",
            "state": "downloading",
            "progress": progress,
            "speed": status.get("speed"),
            "eta": status.get("eta"),
        })
    elif state == "finished":
        emit({"event": "progress", "state": "processing", "progress": 85})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download one YouTube item or playlist with yt-dlp.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--format", required=True, choices=("MP4", "MP3", "WAV", "OGG", "M4A"))
    parser.add_argument("--quality", required=True)
    parser.add_argument("--cookies-directory")
    parser.add_argument("--job-id", required=True)
    return parser.parse_args()


def output_extension(args: argparse.Namespace) -> str:
    return ".mp4" if args.format == "MP4" else f".{args.format.lower()}"


def make_playlist_archive(download_directory: Path, playlist_title: str, job_id: str) -> Path:
    """Package playlist media into one archive so the HTTP result remains a single download."""
    archive_path = download_directory.parent / f"{clean_title(playlist_title)}-{job_id}.zip"
    files = sorted(file for file in download_directory.iterdir() if file.is_file())
    if not files:
        raise RuntimeError("yt-dlp completed without producing playlist files.")
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, file.name)
    shutil.rmtree(download_directory, ignore_errors=True)
    return archive_path


def main() -> int:
    args = parse_args()
    cookie_file, cookie_issue = find_cookie_file(args.cookies_directory)
    emit({
        "event": "started",
        "cookies_configured": bool(cookie_file),
        "cookies_issue": cookie_issue,
    })
    download_directory = Path(args.output_directory) / args.job_id
    try:
        with yt_dlp.YoutubeDL(options_for(args, cookie_file, download_directory)) as downloader:
            metadata = downloader.extract_info(args.url, download=True)
            title = clean_title(metadata.get("title") or "youtube-download")
            is_playlist = metadata.get("_type") == "playlist" or metadata.get("entries") is not None
            if is_playlist:
                output_path = make_playlist_archive(download_directory, title, args.job_id)
                mimetype = "application/zip"
                filename = f"{title}.zip"
            else:
                original_path = Path(downloader.prepare_filename(metadata))
                output_path = original_path.with_suffix(output_extension(args))
                if not output_path.is_file():
                    raise RuntimeError("yt-dlp completed without producing the expected output file.")
                mimetype = None
                filename = output_path.name

        if not output_path.is_file():
            raise RuntimeError("yt-dlp completed without producing the expected output file.")
        emit({
            "event": "complete",
            "path": str(output_path),
            "filename": filename,
            **({"mimetype": mimetype} if mimetype else {}),
            "archive": is_playlist,
            "title": title,
        })
        return 0
    except Exception as error:  # yt-dlp raises several provider-specific exception types.
        shutil.rmtree(download_directory, ignore_errors=True)
        emit({"event": "error", "error": friendly_error(error, cookie_file, cookie_issue)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
