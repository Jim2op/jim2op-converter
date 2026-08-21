import argparse
import json
import time
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--kind", required=True)
parser.add_argument("--output-directory", required=True)
parser.add_argument("--format", required=True)
parser.add_argument("--quality", required=True)
parser.add_argument("--cookies-directory", required=True)
args = parser.parse_args()

output = Path(args.output_directory) / "fake-playlist.zip"
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("01 - Fixture song.m4a", b"fixture-audio")
    archive.writestr("playlist.m3u8", "#EXTM3U\n01 - Fixture song.m4a\n")
print(json.dumps({"event": "started", "cookies_configured": False}), flush=True)
print(json.dumps({"event": "progress", "state": "downloading", "progress": 38, "completed": 1, "total": 3, "current_item": "Track 1 — Fixture song", "message": "Downloading track 2 of 3"}), flush=True)
time.sleep(0.08)
print(json.dumps({"event": "progress", "state": "downloading", "progress": 72, "completed": 2, "total": 3, "current_item": "Track 2 — Fixture song", "message": "Downloading track 3 of 3"}), flush=True)
time.sleep(0.08)
print(json.dumps({"event": "complete", "path": str(output), "filename": output.name, "mimetype": "application/zip", "archive": True, "completed": 3, "total": 3}), flush=True)
