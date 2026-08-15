import importlib.util
from pathlib import Path
import unittest

WORKER_PATH = Path(__file__).parents[1] / "python" / "spotify_worker.py"
SPEC = importlib.util.spec_from_file_location("spotify_worker", WORKER_PATH)
WORKER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(WORKER)


class SpotifyWorkerProgressTests(unittest.TestCase):
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
