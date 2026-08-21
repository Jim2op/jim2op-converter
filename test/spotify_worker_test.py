"""Regression coverage for Spotify playlist archive creation and worker diagnostics."""

import argparse
import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path


WORKER_PATH = Path(__file__).resolve().parents[1] / "workers" / "spotify_worker.py"
SPEC = importlib.util.spec_from_file_location("spotify_worker", WORKER_PATH)
assert SPEC and SPEC.loader
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)


class SpotifyWorkerArchiveTests(unittest.TestCase):
    def test_playlist_command_uses_a_playlist_positioned_output_template(self) -> None:
        arguments = argparse.Namespace(
            url="https://open.spotify.com/playlist/example",
            output_directory="/tmp/playlist-job",
            format="MP3",
            quality="192",
            kind="playlist",
        )
        command = WORKER.build_command(arguments, None)

        self.assertTrue(any("{list-position} - {artists} - {title}.{output-ext}" in item for item in command))
        self.assertNotIn("--m3u", command)
        self.assertIn("--playlist-numbering", command)

    def test_playlist_archive_contains_only_audio_and_manifest_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_directory = Path(temporary_directory)
            nested_directory = output_directory / "nested"
            nested_directory.mkdir()
            audio_file = nested_directory / "01 - Artist - Title.mp3"
            audio_file.write_bytes(b"audio")
            manifest = output_directory / "playlist.m3u8"
            manifest.write_text("nested/01 - Artist - Title.mp3\n", encoding="utf-8")
            (output_directory / "provider-debug.log").write_text("do not archive", encoding="utf-8")

            archive_path = WORKER.create_download_archive(output_directory, [audio_file])

            with zipfile.ZipFile(archive_path) as archive:
                self.assertEqual(sorted(archive.namelist()), ["nested/01 - Artist - Title.mp3", "playlist.m3u8"])
                self.assertEqual(archive.read("playlist.m3u8").decode("utf-8"), "#EXTM3U\nnested/01 - Artist - Title.mp3\n")

    def test_worker_failure_prefers_an_actionable_provider_error(self) -> None:
        message = WORKER.friendly_failure(["preparing", "WARNING retrying", "ERROR playlist is unavailable"])
        self.assertEqual(message, "ERROR playlist is unavailable")


if __name__ == "__main__":
    unittest.main()
