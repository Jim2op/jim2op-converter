"""Simulate the legacy playlist failure caused by a non-portable M3U reference in a job archive."""

import argparse
import json


parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--kind", required=True)
parser.add_argument("--output-directory", required=True)
parser.add_argument("--format", required=True)
parser.add_argument("--quality", required=True)
parser.add_argument("--cookies-directory", required=True)
parser.parse_args()

print(json.dumps({"event": "started", "cookies_configured": False}), flush=True)
print(json.dumps({"event": "progress", "state": "finalizing", "progress": 96, "completed": 2, "total": 2, "message": "Preparing playlist archive"}), flush=True)
print(json.dumps({"event": "error", "error": "Legacy playlist archive contains temporary M3U paths and cannot be used after download."}), flush=True)
raise SystemExit(1)
