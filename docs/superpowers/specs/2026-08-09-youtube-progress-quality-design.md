# YouTube Download Progress and Quality Design

## Scope

Add live YouTube download progress and quality selection to the existing Flask converter. Video downloads offer 1080p, 720p, 480p, and 360p. Audio downloads offer 320, 256, 192, 128, and 96 kbps.

## Architecture

- Replace the single blocking YouTube form submission with a background download job.
- Add `POST /youtube/download` to validate input and create a job ID.
- Run yt-dlp in a worker thread using the existing authentication and bundled FFmpeg configuration.
- Add `GET /youtube/progress/<job_id>` returning JSON state, percentage, speed, ETA, and error details.
- Add `GET /youtube/result/<job_id>` to serve the completed file.
- Keep job state in memory for this local application and remove temporary files after result delivery or failure cleanup.
- Preserve the existing `/convert` route for image/video uploads and compatibility.

## Quality mapping

- MP4 video: select `bestvideo[height<=HEIGHT]+bestaudio/best[height<=HEIGHT]`, with the selected height as the cap.
- Audio outputs: select best audio and configure `FFmpegExtractAudio.preferredquality` from the selected bitrate.
- Validate quality values server-side; reject values that do not match the selected output type.

## Browser behavior

- The YouTube form submits with `fetch` and receives a job ID.
- A Bootstrap progress bar displays percentage when yt-dlp provides it, plus state, speed, and ETA.
- Poll progress approximately every 500 ms.
- On completion, trigger the result URL for automatic download.
- Disable duplicate submission while a job is active and display actionable failures in the progress panel.
- Reset clears the form preview and progress state when no job is active.

## Error handling and testing

- Worker exceptions mark the job failed and expose a safe error message through the progress endpoint.
- Missing or expired cookie guidance remains available in the failure message.
- Add unit tests for quality mapping, progress hook updates, job status transitions, and route validation.
- Run the complete existing test suite, Python syntax checks, and Flask route smoke tests.

## Non-goals

- No persistent database or distributed job queue.
- No changes to local image/video conversion.
- No changes to cookie contents or authentication precedence.
