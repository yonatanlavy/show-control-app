"""Owner-paired preparation helper for iOS. Python 3.10+, yt-dlp and FFmpeg."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import socketserver
import ssl
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import uuid

MAX_BYTES = 500_000_000
TERMINAL = {"ready", "cancelled", "error", "interrupted"}


def valid_id(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise ValueError("DOWNLOAD_INVALID")
    return value


def public_addresses(host, port=443):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global or ipaddress.ip_address(item[4][0]).is_multicast for item in addresses):
        raise ValueError("DOWNLOAD_URL")
    return addresses


def source_url(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 4096 or any(ord(c) < 32 for c in value):
        raise ValueError("DOWNLOAD_URL")
    url = urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.port not in (None, 443):
        raise ValueError("DOWNLOAD_URL")
    public_addresses(url.hostname)
    return value


class PublicProxy(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    # yt-dlp downloads through this proxy; all redirects and extracted URLs are
    # checked at connection time and connected to the exact validated address.


class PublicTunnel(socketserver.BaseRequestHandler):
    def handle(self):
        remote = None
        try:
            self.request.settimeout(20)
            header = bytearray()
            while b"\r\n\r\n" not in header:
                block = self.request.recv(1)
                if not block or len(header) >= 8192:
                    return
                header.extend(block)
            method, authority, _ = header.decode("ascii").split("\r\n", 1)[0].split(" ", 2)
            if method != "CONNECT":
                raise ValueError("HTTPS required")
            host, sep, port = authority.rpartition(":")
            if not sep or port != "443" or not host:
                raise ValueError("Invalid tunnel")
            addresses = public_addresses(host.strip("[]"))
            for family, kind, protocol, _, address in addresses:
                candidate = socket.socket(family, kind, protocol)
                candidate.settimeout(5)
                try:
                    candidate.connect(address)
                    remote = candidate
                    break
                except OSError:
                    candidate.close()
            if remote is None:
                raise OSError("No reachable public address")
            remote.settimeout(20)
            self.request.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")

            def copy(source, destination):
                with contextlib.suppress(OSError):
                    while True:
                        part = source.recv(65536)
                        if not part:
                            break
                        destination.sendall(part)
                with contextlib.suppress(OSError):
                    destination.shutdown(socket.SHUT_WR)

            outbound = threading.Thread(target=copy, args=(self.request, remote), daemon=True)
            outbound.start()
            copy(remote, self.request)
            outbound.join(timeout=2)
        except (OSError, ValueError, UnicodeError):
            with contextlib.suppress(OSError):
                self.request.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
        finally:
            if remote:
                remote.close()


class Helper:
    def __init__(self, root: Path, ffmpeg: str):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.ffmpeg = ffmpeg
        self.lock = threading.RLock()
        self.jobs = {}
        self.processes = {}
        self.cancelled = set()
        self.searching = False
        self.proxy = PublicProxy(("127.0.0.1", 0), PublicTunnel)
        threading.Thread(target=self.proxy.serve_forever, daemon=True).start()
        self.path = self.root / "jobs.json"
        if self.path.exists():
            if self.path.stat().st_size > 2_000_000:
                raise ValueError("DOWNLOAD_INVALID")
            self.jobs = json.loads(self.path.read_text("utf-8"))
            for identifier, job in self.jobs.items():
                valid_id(identifier)
                if job["stage"] not in TERMINAL:
                    job.update(stage="interrupted", errorCode="DOWNLOAD_INTERRUPTED")
        self.save()

    def directory(self, identifier):
        target = (self.root / valid_id(identifier)).resolve()
        if target.parent != self.root:
            raise ValueError("DOWNLOAD_INVALID")
        return target

    def save(self):
        with self.lock:
            temp = self.path.with_suffix(".tmp")
            temp.write_text(json.dumps(self.jobs), "utf-8")
            os.replace(temp, self.path)

    def status(self, identifier):
        with self.lock:
            job = self.jobs.get(valid_id(identifier))
            if not job:
                raise ValueError("DOWNLOAD_NOT_FOUND")
            return dict(job)

    def kill(self, identifier):
        with self.lock:
            process = self.processes.get(identifier)
        if not process or process.poll() is not None:
            return
        if os.name == "nt":
            # Fixed numeric PID of our own child, no shell or filesystem command.
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
        else:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)

    def cancel(self, identifier):
        valid_id(identifier)
        with self.lock:
            self.cancelled.add(identifier)
            job = self.jobs.get(identifier)
            if job:
                job.update(stage="cancelled", percent=None)
                self.save()
        self.kill(identifier)

    def run(self, identifier, arguments, timeout, collect=False):
        with self.lock:
            if identifier in self.cancelled:
                raise ValueError("DOWNLOAD_CANCELLED")
        command = [shutil.which("yt-dlp") or "yt-dlp", "--ignore-config", "--no-cache-dir",
                   "--no-playlist", "--no-warnings", "--socket-timeout", "15", "--retries", "1",
                   "--extractor-retries", "1", "--ffmpeg-location", self.ffmpeg,
                   "--proxy", "http://127.0.0.1:" + str(self.proxy.server_address[1]),
                   "--downloader", "native", *arguments]
        kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **kwargs)
        with self.lock:
            self.processes[identifier] = process
            if identifier in self.cancelled:
                self.kill(identifier)
        output = bytearray()
        failure = []
        finished = threading.Event()
        started = time.monotonic()

        def supervise():
            while not finished.wait(0.5):
                directory = self.directory(identifier)
                size = sum(file.stat().st_size for file in directory.glob("*") if file.is_file()) if directory.exists() else 0
                code = ("DOWNLOAD_TIMEOUT" if time.monotonic() - started > timeout else
                        "DOWNLOAD_SIZE" if size > MAX_BYTES else
                        "DOWNLOAD_STORAGE" if shutil.disk_usage(self.root).free < 32_000_000 else None)
                if code:
                    failure.append(code)
                    self.kill(identifier)
                    break
        threading.Thread(target=supervise, daemon=True).start()
        try:
            assert process.stdout is not None
            # readline size bounds prevent provider output from consuming unbounded RAM.
            while True:
                line = process.stdout.readline(8192)
                if not line:
                    break
                if collect:
                    output.extend(line)
                    if len(output) > 2_000_000:
                        raise ValueError("DOWNLOAD_INVALID")
                else:
                    match = re.match(rb"SC_PROGRESS:(\d+):([\d.]+)", line)
                    with self.lock:
                        job = self.jobs.get(identifier)
                        if job and identifier not in self.cancelled:
                            if match:
                                total = float(match[2])
                                job.update(stage="downloading", percent=min(100, int(match[1]) * 100 / total) if total > 0 else None)
                                self.save()
                            elif b"[ExtractAudio]" in line:
                                job.update(stage="extracting", percent=None)
                                self.save()
            code = process.wait(timeout=10)
            if identifier in self.cancelled:
                raise ValueError("DOWNLOAD_CANCELLED")
            if failure:
                raise ValueError(failure[0])
            if code:
                raise ValueError("DOWNLOAD_SOURCE_FAILED")
            return bytes(output).decode("utf-8")
        finally:
            finished.set()
            self.kill(identifier)
            with self.lock:
                self.processes.pop(identifier, None)

    def search(self, query, identifier):
        valid_id(identifier)
        if not isinstance(query, str) or not 2 <= len(query.strip()) <= 500 or any(ord(c) < 32 for c in query):
            raise ValueError("DOWNLOAD_INVALID")
        with self.lock:
            if self.searching or any(job["stage"] not in TERMINAL for job in self.jobs.values()):
                raise ValueError("DOWNLOAD_BUSY")
            self.searching = True
        try:
            if query.startswith("https://"):
                target = source_url(query.strip())
            else:
                if "://" in query or query.startswith("-"):
                    raise ValueError("DOWNLOAD_URL")
                target = "ytsearch5:" + query.strip()
            raw = self.run(identifier, ["--skip-download", "--dump-single-json", "--flat-playlist",
                                       "--playlist-end", "5", "--", target], 90, True)
            payload = json.loads(raw[raw.index("{"):])
            results = []
            for item in payload.get("entries", [payload])[:5]:
                if not item or item.get("is_live"):
                    continue
                url = item.get("webpage_url") or item.get("url") or ""
                with contextlib.suppress(ValueError, OSError):
                    url = source_url(url)
                    duration = item.get("duration")
                    results.append({"url": url, "title": str(item.get("title") or "Audio")[:200],
                                    "uploader": str(item.get("uploader") or item.get("channel") or "")[:200],
                                    "durationSeconds": duration if isinstance(duration, (int, float)) and 0 < duration <= 7200 else None})
            return results
        finally:
            with self.lock:
                self.searching = False

    def start(self, data):
        identifier = valid_id(data.get("id"))
        url = source_url(data.get("url"))
        title = data.get("title")
        if not isinstance(title, str) or not 1 <= len(title) <= 200:
            raise ValueError("DOWNLOAD_INVALID")
        with self.lock:
            existing = self.jobs.get(identifier)
            if existing:
                if existing["url"] != url:
                    raise ValueError("DOWNLOAD_INVALID")
                return dict(existing)
            if self.searching or any(job["stage"] not in TERMINAL for job in self.jobs.values()):
                raise ValueError("DOWNLOAD_BUSY")
            if len(self.jobs) >= 200:
                raise ValueError("DOWNLOAD_HISTORY_FULL")
            if shutil.disk_usage(self.root).free < 64_000_000:
                raise ValueError("DOWNLOAD_STORAGE")
            job = {"id": identifier, "url": url, "title": title, "stage": "queued", "percent": None,
                   "createdAt": int(time.time() * 1000)}
            self.jobs[identifier] = job
            self.save()
        threading.Thread(target=self.prepare, args=(identifier,), daemon=True).start()
        return dict(job)

    def prepare(self, identifier):
        directory = self.directory(identifier)
        directory.mkdir(exist_ok=True)
        try:
            with self.lock:
                job = self.jobs[identifier]
                if identifier in self.cancelled:
                    return
                job["stage"] = "resolving"
                self.save()
            self.run(identifier, ["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0",
                                  "--max-filesize", str(MAX_BYTES), "--match-filter", "!is_live & duration<=?7200",
                                  "--no-continue", "--newline", "--progress-template",
                                  "download:SC_PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes_estimate)s",
                                  "-o", str(directory / "audio.%(ext)s"), "--", job["url"]], 1200)
            audio = directory / "audio.mp3"
            if not audio.is_file() or not 128 <= audio.stat().st_size <= MAX_BYTES:
                raise ValueError("DOWNLOAD_SOURCE_FAILED")
            digest = hashlib.sha256()
            with audio.open("rb") as stream:
                for block in iter(lambda: stream.read(262_144), b""):
                    digest.update(block)
            with self.lock:
                if identifier not in self.cancelled:
                    job.update(stage="ready", percent=100, bytes=audio.stat().st_size, sha256=digest.hexdigest())
                    self.save()
        except Exception as error:
            with self.lock:
                if identifier not in self.cancelled:
                    code = str(error) if str(error).startswith("DOWNLOAD_") else "DOWNLOAD_SOURCE_FAILED"
                    self.jobs[identifier].update(stage="error", percent=None, errorCode=code)
                    self.save()
        finally:
            if self.jobs[identifier]["stage"] != "ready":
                shutil.rmtree(directory)

    def delete(self, identifier):
        valid_id(identifier)
        with self.lock:
            job = self.jobs.get(identifier)
            if job and job["stage"] not in TERMINAL:
                raise ValueError("DOWNLOAD_BUSY")
            if identifier in self.processes:
                raise ValueError("DOWNLOAD_BUSY")
            directory = self.directory(identifier)
            if directory.exists():
                shutil.rmtree(directory)
            self.jobs.pop(identifier, None)
            self.save()


class Api(BaseHTTPRequestHandler):
    server_version = "ShowControlMusicHelper/1"
    protocol_version = "HTTP/1.1"
    def log_message(self, *args):
        pass  # No pairing tokens, prompts or URLs in HTTP logs.

    def json_response(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        actual = self.headers.get("Authorization", "")
        return hmac.compare_digest(actual.encode(), ("Bearer " + self.server.token).encode())

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not 1 <= length <= 16_384:
            raise ValueError("DOWNLOAD_INVALID")
        result = json.loads(self.rfile.read(length))
        if not isinstance(result, dict):
            raise ValueError("DOWNLOAD_INVALID")
        return result

    def dispatch(self):
        self.connection.settimeout(30)
        if not self.authorized():
            self.close_connection = True
            return self.json_response({"errorCode": "DOWNLOAD_HELPER_AUTH"}, 401)
        if self.headers.get("Origin"):
            self.close_connection = True
            return self.json_response({"errorCode": "DOWNLOAD_INVALID"}, 403)
        route = urlsplit(self.path).path
        helper = self.server.helper
        try:
            if self.command == "GET" and route == "/health":
                return self.json_response({"version": 1, "ready": bool(shutil.which("yt-dlp"))})
            if self.command == "POST" and route == "/search":
                data = self.body()
                return self.json_response({"sources": helper.search(data.get("query"), data.get("id"))})
            if self.command == "POST" and route == "/jobs":
                return self.json_response(helper.start(self.body()), 202)
            match = re.fullmatch(r"/jobs/([a-f0-9-]{36})(/audio|/cancel)?", route)
            if match:
                identifier, suffix = match.groups()
                if self.command == "DELETE":
                    if suffix == "/cancel":
                        helper.cancel(identifier)
                    elif suffix is None:
                        helper.delete(identifier)
                    else:
                        raise ValueError("DOWNLOAD_INVALID")
                    return self.json_response({"ok": True})
                if self.command == "GET" and suffix is None:
                    return self.json_response(helper.status(identifier))
                if self.command == "GET" and suffix == "/audio":
                    job = helper.status(identifier)
                    if job["stage"] != "ready":
                        raise ValueError("DOWNLOAD_NOT_READY")
                    path = helper.directory(identifier) / "audio.mp3"
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/mpeg")
                    self.send_header("Content-Length", str(path.stat().st_size))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    with path.open("rb") as stream:
                        shutil.copyfileobj(stream, self.wfile, length=262_144)
                    return
            return self.json_response({"errorCode": "DOWNLOAD_NOT_FOUND"}, 404)
        except (ValueError, OSError, TypeError, KeyError) as error:
            code = str(error) if str(error).startswith("DOWNLOAD_") else "DOWNLOAD_INVALID"
            self.close_connection = True
            return self.json_response({"errorCode": code}, 409 if code == "DOWNLOAD_BUSY" else 400)

    do_GET = dispatch
    do_POST = dispatch
    do_DELETE = dispatch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listen", default="127.0.0.1", help="Use a private LAN address to pair an iPhone.")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--directory", type=Path, default=Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "ShowControlMusicHelper")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "")
    parser.add_argument("--cert", help="Optional HTTPS certificate PEM")
    parser.add_argument("--key", help="Optional HTTPS key PEM")
    args = parser.parse_args()
    if not shutil.which("yt-dlp") or not args.ffmpeg:
        parser.error("Install yt-dlp and FFmpeg, or supply --ffmpeg with your local FFmpeg path.")
    args.directory.mkdir(parents=True, exist_ok=True)
    token_path = args.directory / "pairing-token"
    if not token_path.exists():
        token_path.write_text(secrets.token_urlsafe(32), "utf-8")
        if os.name != "nt":
            token_path.chmod(0o600)
    token = token_path.read_text("utf-8").strip()
    helper = Helper(args.directory, args.ffmpeg)
    server = ThreadingHTTPServer((args.listen, args.port), Api)
    server.daemon_threads = True
    server.helper = helper
    server.token = token
    if args.cert and args.key:
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(args.cert, args.key)
        server.socket = tls.wrap_socket(server.socket, server_side=True)
    print("Show Control music helper is ready. Enter its private LAN address and pairing code in the app.")
    print("Pairing code:", token, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        for identifier in list(helper.processes):
            helper.cancel(identifier)
    finally:
        server.server_close()
        helper.proxy.shutdown()


if __name__ == "__main__":
    main()
