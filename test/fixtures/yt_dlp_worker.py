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

output = Path(args.output_directory) / "fake-youtube.mp3"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(b"fake-youtube-result")
print(json.dumps({"event": "started", "cookies_configured": False}), flush=True)
print(json.dumps({"event": "progress", "state": "downloading", "progress": 62, "speed": 1024, "eta": 1}), flush=True)
print(json.dumps({"event": "complete", "path": str(output), "filename": output.name, "mimetype": "audio/mpeg", "archive": False}), flush=True)
