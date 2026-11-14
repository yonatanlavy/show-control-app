import importlib.util
import io
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location("music_helper", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
PUBLIC = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]

class Inputs(unittest.TestCase):
    def test_valid_public_source(self):
        with patch.object(socket, "getaddrinfo", return_value=PUBLIC):
            self.assertEqual(server.source_url("https://example.com/audio.mp3"), "https://example.com/audio.mp3")
    def test_private_dns_and_mixed_answers(self):
        for address in ["127.0.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "224.0.0.1", "0.0.0.0"]:
            with self.subTest(address=address), patch.object(socket, "getaddrinfo", return_value=[*PUBLIC, (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))]):
                with self.assertRaises(ValueError):
                    server.source_url("https://example.com/audio")
    def test_unsupported_schemes_credentials_ports_and_controls(self):
        for value in ["file:///etc/passwd", "http://example.com/a", "ftp://example.com/a", "https://user:pass@example.com/a", "https://example.com:444/a", "https://example.com/\n"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                server.source_url(value)
    def test_id_boundary(self):
        identifier = str(uuid.uuid4())
        self.assertEqual(server.valid_id(identifier), identifier)
        for value in ["../escape", "missing", identifier.upper()]:
            with self.assertRaises(ValueError):
                server.valid_id(value)

class Protocol(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="showcontrol-helper-test-")
        self.helper = server.Helper(Path(self.temp.name), "ffmpeg")
        self.api = ThreadingHTTPServer(("127.0.0.1", 0), server.Api)
        self.api.helper = self.helper
        self.api.token = "test-pairing-code-that-is-not-a-user-secret"
        self.thread = threading.Thread(target=self.api.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:" + str(self.api.server_address[1])
        self.identifier = str(uuid.uuid4())
    def tearDown(self):
        self.api.shutdown()
        self.api.server_close()
        self.helper.proxy.shutdown()
        self.helper.proxy.server_close()
        self.temp.cleanup()
    def request(self, path, method="GET", body=None, auth=True, origin=None):
        headers = {"Authorization": "Bearer " + self.api.token} if auth else {}
        if origin:
            headers["Origin"] = origin
        request = urllib.request.Request(self.base + path, method=method, headers=headers,
                                         data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(request, timeout=5) as result:
                return result.status, result.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()
    def test_requires_pairing_and_rejects_browser_origins(self):
        self.assertEqual(self.request("/health", auth=False)[0], 401)
        self.assertEqual(self.request("/health", origin="https://evil.example")[0], 403)
    def test_health_does_not_expose_token_paths_or_jobs(self):
        with patch.object(server.shutil, "which", return_value="yt-dlp"):
            status, body = self.request("/health")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), {"version": 1, "ready": True})
            self.assertNotIn(self.api.token.encode(), body)
    def test_invalid_jobs_and_general_files_are_inaccessible(self):
        self.assertEqual(self.request("/jobs/../../etc/passwd")[0], 404)
        self.assertEqual(self.request("/jobs", "POST", {"id": "../escape", "url": "file:///etc/passwd"})[0], 400)
    def test_cancel_unknown_id_is_idempotent(self):
        path = "/jobs/" + self.identifier + "/cancel"
        self.assertEqual(self.request(path, "DELETE")[0], 200)
        self.assertEqual(self.request(path, "DELETE")[0], 200)
    def test_missing_or_unready_audio_cannot_be_read(self):
        self.assertEqual(self.request("/jobs/" + self.identifier + "/audio")[0], 400)
        self.helper.jobs[self.identifier] = {"id": self.identifier, "stage": "queued"}
        self.assertEqual(self.request("/jobs/" + self.identifier + "/audio")[0], 400)
    def test_ready_audio_streams_only_the_job_file(self):
        directory = self.helper.directory(self.identifier)
        directory.mkdir()
        audio = b"ID3" + b"x" * 1000
        (directory / "audio.mp3").write_bytes(audio)
        self.helper.jobs[self.identifier] = {"id": self.identifier, "stage": "ready"}
        self.assertEqual(self.request("/jobs/" + self.identifier + "/audio"), (200, audio))
    def test_delete_preserves_other_job_files(self):
        second = str(uuid.uuid4())
        for identifier in [self.identifier, second]:
            directory = self.helper.directory(identifier); directory.mkdir()
            (directory / "audio.mp3").write_bytes(b"keep")
            self.helper.jobs[identifier] = {"id": identifier, "stage": "ready"}
        self.assertEqual(self.request("/jobs/" + self.identifier, "DELETE")[0], 200)
        self.assertFalse(self.helper.directory(self.identifier).exists())
        self.assertTrue(self.helper.directory(second).exists())
    def test_one_job_and_idempotent_post(self):
        data = {"id": self.identifier, "url": "https://example.com/song", "title": "Song"}
        with patch.object(server, "source_url", side_effect=lambda value: value), patch.object(self.helper, "prepare"):
            first = self.helper.start(data)
            self.assertEqual(self.helper.start(data)["id"], first["id"])
            with self.assertRaisesRegex(ValueError, "DOWNLOAD_BUSY"):
                self.helper.start({**data, "id": str(uuid.uuid4())})
    def test_process_death_marks_jobs_interrupted_without_restart(self):
        self.helper.jobs[self.identifier] = {"id": self.identifier, "stage": "downloading"}
        self.helper.save()
        other = server.Helper(Path(self.temp.name), "ffmpeg")
        try:
            self.assertEqual(other.status(self.identifier)["stage"], "interrupted")
            self.assertEqual(other.processes, {})
        finally:
            other.proxy.shutdown(); other.proxy.server_close()
    def test_search_argument_injection_is_rejected(self):
        for query in ["--exec dangerous", "file:///etc/passwd", "x\n--exec"]:
            with self.assertRaises(ValueError):
                self.helper.search(query, str(uuid.uuid4()))

if __name__ == "__main__":
    unittest.main()
