import importlib.util
from pathlib import Path
import tempfile
import unittest

WORKER_PATH = Path(__file__).parents[1] / "python" / "yt_dlp_worker.py"
SPEC = importlib.util.spec_from_file_location("yt_dlp_worker", WORKER_PATH)
WORKER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(WORKER)


class YtDlpWorkerTests(unittest.TestCase):
    def test_validates_and_selects_a_netscape_cookie_export(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            cookie_path = Path(temporary_directory) / "cookies.txt"
            cookie_path.write_text("# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tredacted\n")
            selected, issue = WORKER.find_cookie_file(temporary_directory)
            self.assertEqual(selected, cookie_path)
            self.assertIsNone(issue)

    def test_rejects_a_non_netscape_cookie_file(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            (Path(temporary_directory) / "cookies.txt").write_text("SQLite format 3\x00")
            selected, issue = WORKER.find_cookie_file(temporary_directory)
            self.assertIsNone(selected)
            self.assertIn("Netscape-format", issue)

    def test_forbidden_response_explains_how_to_recover(self):
        message = WORKER.friendly_error(RuntimeError("HTTP Error 403: Forbidden"), None, "Cookies folder was not found.")
        self.assertIn("403 Forbidden", message)
        self.assertIn("cookies.txt", message)


if __name__ == "__main__":
    unittest.main()
