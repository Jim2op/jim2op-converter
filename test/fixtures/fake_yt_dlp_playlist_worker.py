#!/usr/bin/env python3
"""Test-only worker fixture that models a playlist returned as one ZIP archive."""

import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--output-directory", required=True)
parser.add_argument("--format", required=True)
parser.add_argument("--quality", required=True)
parser.add_argument("--cookies-directory", required=True)
parser.add_argument("--job-id", required=True)
args = parser.parse_args()

output_path = Path(args.output_directory) / "test-playlist.zip"
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_bytes(b"playlist archive")
print(json.dumps({"event": "started", "cookies_configured": False}), flush=True)
print(json.dumps({"event": "progress", "state": "downloading", "progress": 72}), flush=True)
print(json.dumps({
    "event": "complete",
    "path": str(output_path),
    "filename": "test-playlist.zip",
    "mimetype": "application/zip",
    "archive": True,
    "title": "test-playlist",
}), flush=True)

