#!/usr/bin/env python3
"""Run one yt-dlp job and report machine-readable progress to the Node.js server."""

from __future__ import annotations

import argparse
import json
import re
import sys
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


def find_cookie_file(cookies_directory: str | None) -> Path | None:
    """Select a Netscape-format cookie export without reading or logging its contents."""
    if not cookies_directory:
        return None
    directory = Path(cookies_directory)
    if not directory.is_dir():
        return None

    preferred_names = ("cookies.txt", "youtube-cookies.txt", "youtube.txt")
    for name in preferred_names:
        candidate = directory / name
        if candidate.is_file():
            return candidate

    for candidate in sorted(directory.glob("*.txt")):
        if candidate.is_file():
            return candidate
    return None


def options_for(args: argparse.Namespace, cookie_file: Path | None) -> dict[str, Any]:
    """Build yt-dlp options for a single video or audio download."""
    output_directory = Path(args.output_directory)
    output_directory.mkdir(parents=True, exist_ok=True)
    options: dict[str, Any] = {
        "outtmpl": str(output_directory / "%(title).180B-%(id)s.%(ext)s"),
        "noplaylist": True,
        "restrictfilenames": True,
        "quiet": True,
        "no_warnings": True,
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
    parser = argparse.ArgumentParser(description="Download one YouTube item with yt-dlp.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--format", required=True, choices=("MP4", "MP3", "WAV", "OGG", "M4A"))
    parser.add_argument("--quality", required=True)
    parser.add_argument("--cookies-directory")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    cookie_file = find_cookie_file(args.cookies_directory)
    emit({"event": "started", "cookies_configured": bool(cookie_file)})
    try:
        with yt_dlp.YoutubeDL(options_for(args, cookie_file)) as downloader:
            metadata = downloader.extract_info(args.url, download=True)
            title = clean_title(metadata.get("title") or "youtube-download")
            original_path = Path(downloader.prepare_filename(metadata))

        if args.format == "MP4":
            output_path = original_path.with_suffix(".mp4")
        else:
            output_path = original_path.with_suffix(f".{args.format.lower()}")
        if not output_path.is_file():
            raise RuntimeError("yt-dlp completed without producing the expected output file.")

        emit({
            "event": "complete",
            "path": str(output_path),
            "filename": output_path.name,
            "title": title,
        })
        return 0
    except Exception as error:  # yt-dlp raises several provider-specific exception types.
        emit({"event": "error", "error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
