import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

WORKER_PATH = Path(__file__).parents[1] / "python" / "spotify_worker.py"
SPEC = importlib.util.spec_from_file_location("spotify_worker", WORKER_PATH)
WORKER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(WORKER)


class SpotifyWorkerProgressTests(unittest.TestCase):
    def test_reports_the_project_install_command_when_spotdl_is_missing(self):
        with patch("importlib.util.find_spec", return_value=None):
            with self.assertRaisesRegex(
                RuntimeError,
                r"python -m pip install -r python\\requirements\.txt",
            ):
                WORKER.ensure_spotdl_is_available()

    def test_explains_a_blocked_youtube_match_with_recovery_steps(self):
        diagnostics = [
            "Processing query: https://open.spotify.com/track/abc",
            "AudioProviderError: YT-DLP download error -",
            "https://www.youtube.com/watch?v=example",
        ]
        message = WORKER.friendly_error(diagnostics, cookie_file=None, fallback="spotDL completed without producing an audio file.")
        self.assertIn("blocked", message.lower())
        self.assertIn("yt-dlp", message.lower())
        self.assertIn("cookies.txt", message)

    def test_keeps_the_fallback_message_when_no_known_failure_pattern_is_present(self):
        diagnostics = ["Processing query: https://open.spotify.com/track/abc"]
        message = WORKER.friendly_error(diagnostics, cookie_file=None, fallback="spotDL completed without producing an audio file.")
        self.assertEqual(message, "spotDL completed without producing an audio file.")

    def test_parses_playlist_item_counts_and_current_track(self):
        event, completed, total = WORKER.progress_from_output(
            "Downloading track 2 of 5: Example song",
            completed=1,
        )
        self.assertEqual(completed, 1)
        self.assertEqual(total, 5)
        self.assertEqual(event["completed"], 1)
        self.assertEqual(event["total"], 5)
        self.assertEqual(event["message"], "Downloading track 2 of 5")
        self.assertIn("Example song", event["current_item"])

    def test_does_not_double_count_an_already_observed_audio_file(self):
        event, completed, total = WORKER.progress_from_output(
            "Downloaded and tagged Example song",
            completed=1,
            total=3,
            observed_files=1,
        )
        self.assertEqual(completed, 1)
        self.assertEqual(total, 3)
        self.assertEqual(event["completed"], 1)


if __name__ == "__main__":
    unittest.main()
