#!/usr/bin/env python3
"""Test-only worker fixture that models yt-dlp reporting a 403 recovery message."""

import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--output-directory", required=True)
parser.add_argument("--format", required=True)
parser.add_argument("--quality", required=True)
parser.add_argument("--cookies-directory", required=True)
parser.add_argument("--job-id", required=True)
parser.parse_args()

print(json.dumps({
    "event": "started",
    "cookies_configured": False,
    "cookies_issue": "No valid Netscape-format cookies.txt export was found.",
}), flush=True)
print(json.dumps({
    "event": "error",
    "error": "YouTube returned 403 Forbidden. Update yt-dlp and add a fresh Netscape-format cookies.txt export to the project cookies folder, then restart the Node server.",
}), flush=True)
raise SystemExit(1)
