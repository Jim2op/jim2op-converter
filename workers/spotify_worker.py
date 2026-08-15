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
ITEM_PROGRESS_PATTERN = re.compile(r"(?:track|song)?\s*#?\s*(\d+)\s*(?:/|of)\s*(\d+)", re.IGNORECASE)


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
    command = [
        sys.executable, "-m", "spotdl", "download", args.url,
        "--output", str(output_directory / "{artists} - {title}.{output-ext}"),
        "--format", args.format.lower(), "--bitrate", f"{args.quality}k",
        "--restrict", "ascii", "--overwrite", "force", "--log-level", "INFO", "--print-errors",
    ]
    # spotDL embeds metadata and cover art by default; playlist numbering is retained for archive downloads.
    if args.kind == "playlist":
        command.extend(["--playlist-numbering", "--m3u", str(output_directory / "playlist.m3u8")])
    if cookie_file:
        command.extend(["--cookie-file", str(cookie_file)])
    return command


def audio_outputs(output_directory: Path) -> list[Path]:
    """Return completed audio assets while excluding logs and playlist manifests."""
    return sorted(path for path in output_directory.rglob("*") if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS)


def progress_from_output(line: str, completed: int, total: int | None = None, observed_files: int | None = None) -> tuple[dict[str, Any], int, int | None]:
    """Translate spotDL lines into playlist-aware count, status, and current-item updates."""
    compact = " ".join(line.strip().split())
    lower = compact.lower()
    match = ITEM_PROGRESS_PATTERN.search(compact)
    if match:
        current, total = int(match.group(1)), int(match.group(2))
        completed = max(completed, current - 1)
        return ({"progress": min(90, round(10 + (current / max(total, 1)) * 80, 1)), "state": "downloading", "completed": completed, "total": total, "current_item": compact[:160], "message": f"Downloading track {current} of {total}"}, completed, total)
    if observed_files is not None and observed_files > completed:
        completed = observed_files
    if not compact:
        return ({"progress": 10, "state": "preparing", "completed": completed, "total": total}, completed, total)
    if re.search(r"\b(downloaded|skipping|saved|finished)\b", lower):
        if observed_files is None:
            completed += 1
        elif observed_files > completed:
            completed = observed_files
        elif observed_files == completed == 0:
            completed = 1
        progress = min(90, 15 + completed * (75 / max(total or completed, 1)))
        return ({"progress": round(progress, 1), "state": "downloading", "completed": completed, "total": total, "current_item": compact[:160], "message": f"Completed track {completed}" if total is None else f"Completed track {completed} of {total}"}, completed, total)
    if "metadata" in lower or "embed" in lower or "convert" in lower or "tag" in lower:
        return ({"progress": min(94, max(85, 85 + completed)), "state": "tagging metadata", "completed": completed, "total": total, "current_item": compact[:160], "message": "Embedding metadata and album artwork"}, completed, total)
    return ({"progress": min(88, max(15, 15 + completed * 8)), "state": "downloading", "completed": completed, "total": total, "current_item": compact[:160], "message": compact[:160]}, completed, total)


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
    emit({"event": "progress", "state": "preparing", "progress": 8, "completed": 0, "total": None, "message": "Preparing Spotify download"})
    completed, total, diagnostics = 0, None, []
    try:
        process = subprocess.Popen(build_command(args, cookie_file), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        assert process.stdout is not None
        for line in process.stdout:
            diagnostics.append(line.strip())
            event, completed, total = progress_from_output(line, completed, total, len(audio_outputs(output_directory)))
            emit({"event": "progress", **event})
        if process.wait() != 0:
            raise RuntimeError(next((line for line in reversed(diagnostics) if line), "spotDL could not complete the download."))
        files = audio_outputs(output_directory)
        if not files:
            raise RuntimeError("spotDL completed without producing an audio file.")
        completed, total = max(completed, len(files)), max(total or 0, len(files)) or None
        emit({"event": "progress", "state": "finalizing", "progress": 96, "completed": completed, "total": total, "message": "Preparing your download"})
        if args.kind == "track" and len(files) == 1:
            output_path = files[0]
            emit({"event": "complete", "path": str(output_path), "filename": output_path.name, "mimetype": {"MP3": "audio/mpeg", "WAV": "audio/wav", "OGG": "audio/ogg", "M4A": "audio/mp4"}[args.format], "archive": False, "completed": completed, "total": total})
        else:
            archive_path = Path(shutil.make_archive(str(output_directory / "spotify-download"), "zip", output_directory))
            emit({"event": "complete", "path": str(archive_path), "filename": "spotify-playlist.zip" if args.kind == "playlist" else "spotify-album.zip", "mimetype": "application/zip", "archive": True, "completed": completed, "total": total})
        return 0
    except Exception as error:
        emit({"event": "error", "error": str(error).strip() or "spotDL could not complete the download."})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
