import os
import unittest
from unittest.mock import patch

import app
from app import (
    _build_ytdlp_auth_options,
    _build_ytdlp_ffmpeg_options,
    _update_youtube_progress,
    _youtube_quality_options,
    _youtube_auth_guidance,
    _youtube_format_options,
)


class YouTubeAuthOptionsTests(unittest.TestCase):
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

    def test_download_route_requires_url(self):
        response = app.app.test_client().post(
            "/youtube/download",
            data={"format": "MP4", "quality": "720"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_uses_imageio_ffmpeg_binary_for_ytdlp(self):
        with patch("app.imageio_ffmpeg.get_ffmpeg_exe", return_value=r"C:\ffmpeg\ffmpeg.exe"):
            self.assertEqual(
                _build_ytdlp_ffmpeg_options(),
                {"ffmpeg_location": r"C:\ffmpeg\ffmpeg.exe"},
            )

    def test_mp4_format_allows_available_video_and_audio_codecs(self):
        self.assertEqual(
            _youtube_format_options("MP4"),
            {
                "format": "bestvideo+bestaudio/best",
                "merge_output_format": "mp4",
            },
        )

    def test_uses_existing_cookie_file_before_browser_detection(self):
        with patch.dict(os.environ, {"YT_COOKIES_FILE": r"C:\cookies.txt"}, clear=True), \
             patch("app.os.path.isfile", return_value=True), \
             patch("app._detect_browser_for_ytdlp", side_effect=AssertionError("browser should not be checked")):
            self.assertEqual(
                _build_ytdlp_auth_options(),
                {"cookiefile": r"C:\cookies.txt"},
            )

    def test_uses_detected_local_browser_when_cookie_file_is_not_configured(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch("app.os.path.isfile", return_value=False), \
             patch("app._detect_browser_for_ytdlp", return_value=("firefox",)):
            self.assertEqual(_build_ytdlp_auth_options(), {"cookiesfrombrowser": ("firefox",)})

    def test_uses_explicit_local_browser_selection(self):
        with patch.dict(os.environ, {"YT_BROWSER": "firefox"}, clear=True), \
             patch("app.os.path.isfile", return_value=False):
            self.assertEqual(_build_ytdlp_auth_options(), {"cookiesfrombrowser": ("firefox",)})

    def test_ignores_missing_cookie_file_without_browser_fallback(self):
        with patch.dict(os.environ, {"YT_COOKIES_FILE": r"C:\missing-cookies.txt"}, clear=True), \
             patch("app.os.path.isfile", return_value=False), \
             patch("app._detect_browser_for_ytdlp", side_effect=AssertionError("browser should not be checked")):
            self.assertEqual(_build_ytdlp_auth_options(), {})

    def test_returns_empty_options_when_no_authentication_source_exists(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch("app.os.path.isfile", return_value=False), \
             patch("app._detect_browser_for_ytdlp", return_value=None):
            self.assertEqual(_build_ytdlp_auth_options(), {})

    def test_uses_compatibility_cookie_environment_variable(self):
        with patch.dict(os.environ, {"YTDLP_COOKIES": r"/run/secrets/youtube-cookies.txt"}, clear=True), \
             patch("app.os.path.isfile", return_value=True):
            self.assertEqual(
                _build_ytdlp_auth_options(),
                {"cookiefile": r"/run/secrets/youtube-cookies.txt"},
            )

    def test_uses_repository_cookie_file_by_default(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch("app.os.path.isfile", return_value=True):
            self.assertEqual(
                _build_ytdlp_auth_options(),
                {"cookiefile": os.path.join(str(app.APP_DIR), "cookies", "cookies.txt")},
            )

    def test_auth_guidance_describes_server_cookie_configuration(self):
        guidance = _youtube_auth_guidance(
            "/run/secrets/youtube-cookies.txt",
            {},
        )

        self.assertIn("YT_COOKIES_FILE", guidance)
        self.assertIn("server", guidance.lower())
        self.assertIn("cookies.txt", guidance)
        self.assertNotIn("Sign in to YouTube in Chrome", guidance)


if __name__ == "__main__":
    unittest.main()
