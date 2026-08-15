#!/usr/bin/env python3
"""Test-only stand-in for the yt-dlp worker that emits the documented JSON protocol."""

import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--output-directory", required=True)
parser.add_argument("--format", required=True)
parser.add_argument("--quality", required=True)
parser.add_argument("--cookies-directory", required=True)
args = parser.parse_args()

output_directory = Path(args.output_directory)
output_directory.mkdir(parents=True, exist_ok=True)
output_path = output_directory / f"test-download.{args.format.lower()}"
output_path.write_bytes(b"yt-dlp test fixture")

# These records mirror the real worker so the Node bridge can be tested deterministically.
print(json.dumps({"event": "started", "cookies_configured": False}), flush=True)
print(json.dumps({"event": "progress", "state": "downloading", "progress": 48, "speed": 1024, "eta": 1}), flush=True)
print(json.dumps({"event": "complete", "path": str(output_path), "filename": output_path.name, "title": "test-download"}), flush=True)
