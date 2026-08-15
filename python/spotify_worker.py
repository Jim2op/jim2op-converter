#!/usr/bin/env python3
"""Run one spotDL job and report safe, machine-readable progress to the Node.js server."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a"}


def emit(payload: dict[str, Any]) -> None:
    """Write one newline-delimited JSON record that the Node.js bridge can poll."""
    print(json.dumps(payload), flush=True)


def is_netscape_cookie_export(cookie_file: Path) -> bool:
    """Accept browser-exported Netscape cookies while avoiding browser database files."""
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
                if stripped.count("\t") >= 6:
                    return True
    except OSError:
        return False
    return False


def find_cookie_file(cookies_directory: str | None) -> Path | None:
    """Locate an optional YouTube Music cookie export without exposing its contents."""
    if not cookies_directory:
        return None
    directory = Path(cookies_directory)
    if not directory.is_dir():
        return None
    candidates = [directory / name for name in ("cookies.txt", "youtube-cookies.txt", "youtube.txt")]
    candidates.extend(sorted(directory.glob("*.txt")))
    for candidate in candidates:
        if candidate.is_file() and is_netscape_cookie_export(candidate):
            return candidate
    return None


def build_command(args: argparse.Namespace, cookie_file: Path | None) -> list[str]:
    """Build a spotDL command that preserves Spotify metadata and album artwork by default."""
    output_directory = Path(args.output_directory)
    output_template = str(output_directory / "{artists} - {title}.{output-ext}")
    command = [
        sys.executable,
        "-m",
        "spotdl",
        "download",
        args.url,
        "--output",
        output_template,
        "--format",
        args.format.lower(),
        "--bitrate",
        f"{args.quality}k",
        "--restrict",
        "ascii",
        "--overwrite",
        "force",
        "--log-level",
        "ERROR",
        "--print-errors",
    ]
    # spotDL embeds the track metadata and album cover unless --skip-album-art is supplied; do not disable it.
    if args.kind == "playlist":
        command.extend(["--playlist-numbering", "--m3u", str(output_directory / "playlist.m3u8")])
    if cookie_file:
        command.extend(["--cookie-file", str(cookie_file)])
    return command


def audio_outputs(output_directory: Path) -> list[Path]:
    """Return only completed audio assets; logs and playlist files stay out of single-file responses."""
    return sorted(
        path for path in output_directory.rglob("*")
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
    )


def progress_from_output(line: str, completed: int) -> tuple[int, str, int]:
    """Convert human-readable spotDL output into conservative progress updates."""
    compact = line.strip()
    lower = compact.lower()
    if not compact:
        return 10, "preparing", completed
    if "download" in lower or "search" in lower or "match" in lower:
        return min(88, max(15, 15 + completed * 8)), "downloading", completed
    if "metadata" in lower or "embed" in lower or "convert" in lower:
        return min(94, max(85, 85 + completed)), "tagging metadata", completed
    if re.search(r"\b(downloaded|skipping)\b", lower):
        completed += 1
        return min(94, 25 + completed * 8), "downloading", completed
    return min(90, max(12, 12 + completed * 8)), "downloading", completed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download Spotify tracks, albums, or playlists with spotDL.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--kind", required=True, choices=("track", "album", "playlist"))
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--format", required=True, choices=("MP3", "WAV", "OGG", "M4A"))
    parser.add_argument("--quality", required=True)
    parser.add_argument("--cookies-directory")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_directory = Path(args.output_directory)
    output_directory.mkdir(parents=True, exist_ok=True)
    cookie_file = find_cookie_file(args.cookies_directory)
    emit({"event": "started", "cookies_configured": bool(cookie_file), "cookies_issue": None})
    emit({"event": "progress", "state": "preparing", "progress": 8})

    command = build_command(args, cookie_file)
    completed = 0
    diagnostics: list[str] = []
    try:
        # Pipe output so the browser receives an honest lifecycle even though spotDL has no JSON progress API.
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert process.stdout is not None
        for line in process.stdout:
            progress, state, completed = progress_from_output(line, completed)
            diagnostics.append(line.strip())
            emit({"event": "progress", "state": state, "progress": progress})
        if process.wait() != 0:
            detail = next((line for line in reversed(diagnostics) if line), "spotDL could not complete the download.")
            raise RuntimeError(detail)

        files = audio_outputs(output_directory)
        if not files:
            raise RuntimeError("spotDL completed without producing an audio file.")
        if args.kind == "track" and len(files) == 1:
            output_path = files[0]
            emit({
                "event": "complete",
                "path": str(output_path),
                "filename": output_path.name,
                "mimetype": {"MP3": "audio/mpeg", "WAV": "audio/wav", "OGG": "audio/ogg", "M4A": "audio/mp4"}[args.format],
                "archive": False,
            })
        else:
            # Playlist and album requests download multiple tracks, so deliver one portable archive plus its M3U file.
            archive_path = Path(shutil.make_archive(str(output_directory / "spotify-download"), "zip", output_directory))
            emit({
                "event": "complete",
                "path": str(archive_path),
                "filename": "spotify-playlist.zip" if args.kind == "playlist" else "spotify-album.zip",
                "mimetype": "application/zip",
                "archive": True,
            })
        return 0
    except Exception as error:  # Provider and FFmpeg errors vary by system and are safe to relay as a job failure.
        emit({"event": "error", "error": str(error).strip() or "spotDL could not complete the download."})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
