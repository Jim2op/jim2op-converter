# YouTube Download Progress and Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live YouTube download progress and validated video/audio quality selection without changing local file conversion.

**Architecture:** Keep the existing Flask app but introduce an in-memory job registry backed by worker threads. The browser submits a YouTube job, polls a JSON progress endpoint, and downloads the completed result through a dedicated result endpoint. yt-dlp continues using the existing cookie and FFmpeg helpers.

**Tech Stack:** Flask, yt-dlp, imageio-ffmpeg, Python threading, vanilla JavaScript, Bootstrap 5.3.2, Python unittest.

## Global Constraints

- Video downloads offer 1080p, 720p, 480p, and 360p.
- Audio outputs offer 320, 256, 192, 128, and 96 kbps.
- Keep job state in memory for this local application.
- Preserve `/convert` for image/video uploads and compatibility.
- Do not change cookie contents or authentication precedence.
- No persistent database or distributed job queue.

---

### Task 1: Add quality mappings and job model tests

**Files:**
- Modify: `app.py:1-105`
- Modify: `tests/test_youtube_auth.py`

**Interfaces:**
- Consumes: existing `_youtube_format_options`, `_build_ytdlp_ffmpeg_options`, and `AUDIO_FORMATS`.
- Produces: `_youtube_quality_options(output_format, quality)` returning yt-dlp option dictionaries; `_youtube_quality_choices(output_format)` returning UI choices; a job state structure with `state`, `progress`, `speed`, `eta`, `result_path`, and `error`.

- [ ] **Step 1: Write failing quality tests**

Add tests:

```python
def test_video_quality_caps_height(self):
    self.assertEqual(
        _youtube_quality_options("MP4", "720")["format"],
        "bestvideo[height<=720]+bestaudio/best[height<=720]",
    )

def test_audio_quality_sets_bitrate(self):
    options = _youtube_quality_options("MP3", "320")
    self.assertEqual(options["postprocessors"][0]["preferredquality"], "320")

def test_invalid_quality_is_rejected(self):
    with self.assertRaises(ValueError):
        _youtube_quality_options("MP4", "999")
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
python -m unittest tests.test_youtube_auth.YouTubeAuthOptionsTests.test_video_quality_caps_height tests.test_youtube_auth.YouTubeAuthOptionsTests.test_audio_quality_sets_bitrate tests.test_youtube_auth.YouTubeAuthOptionsTests.test_invalid_quality_is_rejected -v
```

Expected: FAIL because the quality helper does not exist.

- [ ] **Step 3: Implement minimal quality helpers**

Define:

```python
VIDEO_QUALITY_CHOICES = ("1080", "720", "480", "360")
AUDIO_QUALITY_CHOICES = ("320", "256", "192", "128", "96")

def _youtube_quality_options(output_format: str, quality: str) -> dict:
    output_format = output_format.upper()
    choices = VIDEO_QUALITY_CHOICES if output_format == "MP4" else AUDIO_QUALITY_CHOICES
    if output_format not in {"MP4", *AUDIO_FORMATS} or quality not in choices:
        raise ValueError("Unsupported YouTube quality")
    if output_format == "MP4":
        return {
            "format": f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}]",
            "merge_output_format": "mp4",
        }
    return {
        "format": "bestaudio/best",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": output_format.lower(),
            "preferredquality": quality,
        }],
    }

def _youtube_quality_choices(output_format: str) -> tuple[str, ...]:
    return VIDEO_QUALITY_CHOICES if output_format.upper() == "MP4" else AUDIO_QUALITY_CHOICES
```

For MP4, return the height-capped format and `merge_output_format: "mp4"`. For audio, reuse the existing audio postprocessor and replace its `preferredquality` with the validated bitrate. Raise `ValueError` for a quality not valid for the selected format.

- [ ] **Step 4: Run the quality tests**

```powershell
python -m unittest tests.test_youtube_auth -v
```

Expected: all tests PASS.

### Task 2: Add background YouTube job endpoints

**Files:**
- Modify: `app.py:1-255`
- Modify: `tests/test_youtube_auth.py`

**Interfaces:**
- Consumes: `_youtube_quality_options`, `_build_ytdlp_auth_options`, `_build_ytdlp_ffmpeg_options`, and `_youtube_auth_guidance`.
- Produces: `POST /youtube/download`, `GET /youtube/progress/<job_id>`, and `GET /youtube/result/<job_id>`.

- [ ] **Step 1: Write failing route and progress-hook tests**

Test that a progress hook updates a job:

```python
def test_progress_hook_updates_percentage_and_eta(self):
    job = {"state": "starting", "progress": 0, "speed": None, "eta": None}
    _update_youtube_progress(job, {
        "status": "downloading",
        "_percent_str": "42.5%",
        "_speed_str": "2.00MiB/s",
        "_eta_str": "00:10",
    })
    self.assertEqual(job["state"], "downloading")
    self.assertEqual(job["progress"], 42.5)
    self.assertEqual(job["eta"], "00:10")
```

Add a Flask test that posting no URL to `/youtube/download` returns HTTP 400 JSON with an error.

- [ ] **Step 2: Run the new tests and verify they fail**

```powershell
python -m unittest tests.test_youtube_auth -v
```

Expected: FAIL because the progress helper and route do not exist.

- [ ] **Step 3: Implement the in-memory job registry**

Add a module-level dictionary and lock:

```python
YOUTUBE_JOBS = {}
YOUTUBE_JOBS_LOCK = threading.Lock()
```

Each job stores a UUID, state (`queued`, `downloading`, `processing`, `completed`, or `failed`), numeric progress, speed, ETA, error, result path, download name, and MIME type. Use `tempfile.TemporaryDirectory` inside the worker and copy the completed output into a managed temporary file before marking the job complete so the worker's temporary directory can close safely.

- [ ] **Step 4: Implement progress parsing**

Implement `_update_youtube_progress(job, event)` using yt-dlp’s `progress_hooks` event fields. Set `downloading` for `status == "downloading"`, `processing` for `status == "finished"`, and parse `_percent_str` by removing `%` and converting to float. Preserve `None` when speed or ETA are unavailable.

- [ ] **Step 5: Implement the worker and endpoints**

Implement `_run_youtube_job(job_id, youtube_url, output_format, quality)`:

1. Import yt-dlp or return a failed job with the existing dependency message.
2. Create yt-dlp options with output template, quiet mode, FFmpeg location, quality options, auth options, and `progress_hooks`.
3. Download and postprocess the URL.
4. Copy the result to a managed temporary file and store its path/name/MIME.
5. Mark the job completed; on exceptions, store a safe error plus `_youtube_auth_guidance`.

Implement `POST /youtube/download` to validate URL, format, and quality, create the UUID job, start a daemon thread, and return `{job_id, state}` with HTTP 202.

Implement `GET /youtube/progress/<job_id>` to return the public job fields or HTTP 404 JSON.

Implement `GET /youtube/result/<job_id>` to send the completed file as an attachment; reject queued/downloading/failed jobs with appropriate HTTP JSON responses. Register a `response.call_on_close` cleanup callback that deletes the managed file and removes the job entry after the response closes.

- [ ] **Step 6: Run route and progress tests**

```powershell
python -m unittest tests.test_youtube_auth -v
```

Expected: all tests PASS.

### Task 3: Update YouTube form and live progress UI

**Files:**
- Modify: `templates/youtube.html:45-141`
- Modify: `static/style.css`

**Interfaces:**
- Consumes: `/youtube/download`, `/youtube/progress/<job_id>`, and `/youtube/result/<job_id>`.
- Produces: quality dropdown options that switch with MP4/MP3 and a live progress panel.

- [ ] **Step 1: Add quality controls and progress markup**

Expand the output select to include MP4, MP3, WAV, OGG, and M4A, then add a quality select beside it:

```html
<select class="form-select" name="quality" id="qualitySelect">
  <option value="1080">1080p</option>
  <option value="720">720p</option>
  <option value="480">480p</option>
  <option value="360">360p</option>
</select>
```

Add a hidden progress panel with `#downloadProgress`, `#downloadProgressBar`, `#downloadState`, `#downloadStats`, and `#downloadError`. Use `role="status"` for state text and `aria-valuenow` on the progress bar.

- [ ] **Step 2: Implement quality option switching**

When `formatSelect` is MP4, show the four resolution options and label the field “Video quality”. When it is MP3, WAV, OGG, or M4A, show the five bitrate options and label it “Audio quality”. Preserve the selected value only when it exists in the new option list; otherwise select the first option.

- [ ] **Step 3: Replace direct form submission with polling**

Prevent the default submit, POST `youtube_url`, `format`, and `quality` as URL-encoded form data to `/youtube/download`, then poll the progress endpoint every 500 ms. Update:

- bar width and `aria-valuenow` from `progress`;
- state from `state`;
- stats from speed and ETA;
- error panel on failure.

On `completed`, set `window.location` to `/youtube/result/<job_id>` and re-enable controls. Disable the submit button while active, clear stale errors, and avoid polling after reset or failure.

- [ ] **Step 4: Style the progress panel**

Add shared styles for a modern bordered progress panel, compact state/stat text, and failure emphasis that follows existing light/dark theme variables.

- [ ] **Step 5: Verify the template hooks**

```powershell
rg -n "qualitySelect|downloadProgress|downloadProgressBar|/youtube/download|/youtube/progress|/youtube/result" templates/youtube.html
```

Expected: all required controls and endpoint references are present.

### Task 4: Complete validation

**Files:**
- Verify: `app.py`, `templates/youtube.html`, `static/style.css`, `tests/test_youtube_auth.py`

**Interfaces:**
- Consumes: completed quality mappings, job endpoints, and browser polling.
- Produces: verified tests, syntax, and route rendering.

- [ ] **Step 1: Run all tests**

```powershell
python -m unittest discover -s tests -v
```

Expected: all tests PASS.

- [ ] **Step 2: Run syntax validation**

```powershell
python -m py_compile app.py
```

Expected: command exits successfully.

- [ ] **Step 3: Smoke-test all page routes and the validation endpoint**

```powershell
python -c "from app import app; c=app.test_client(); assert c.get('/').status_code == 200; assert c.get('/youtube').status_code == 200; r=c.post('/youtube/download', data={'format':'MP4','quality':'720'}); assert r.status_code == 400"
```

Expected: command exits successfully.

- [ ] **Step 4: Commit the implementation**

```powershell
git add app.py templates/youtube.html static/style.css tests/test_youtube_auth.py
git commit -m "feat: add YouTube progress and quality controls"
```
