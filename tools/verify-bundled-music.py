"""Verify the actual APK and every nested audio payload without loading the archive into RAM."""
import argparse
import hashlib
import io
import json
import struct
import zipfile
from pathlib import Path


class Slice(io.RawIOBase):
    def __init__(self, file, start, size):
        self.file, self.start, self.size, self.position = file, start, size, 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        target = offset if whence == io.SEEK_SET else self.position + offset if whence == io.SEEK_CUR else self.size + offset
        if not 0 <= target <= self.size:
            raise OSError("Archive seek exceeds its packaged entry")
        self.position = target
        return target

    def read(self, size=-1):
        count = min(self.size - self.position, size if size >= 0 else self.size)
        self.file.seek(self.start + self.position)
        data = self.file.read(count)
        self.position += len(data)
        return data


def digest(stream):
    value = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        value.update(chunk)
    return value.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--library", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    catalog = json.loads((args.library / "catalog.json").read_text(encoding="utf-8"))
    expected = {item["sha256"]: item["bytes"] for item in catalog}
    assert len(catalog) == len(expected) == 170
    with zipfile.ZipFile(args.apk) as apk:
        description = json.loads(apk.read("assets/showcontrol-music/manifest.json"))
        assert description["songs"] == 170 and description["playlists"] == 20
        assert set(description["hashes"]) == set(expected)
        entry = apk.getinfo("assets/showcontrol-music/library.zip")
        assert entry.compress_type == zipfile.ZIP_STORED, "Outer archive must not be compressed"
        assert entry.file_size == description["bytes"]
        with apk.open(entry) as stream:
            assert digest(stream) == description["sha256"]
        for name in ["CREDITS.md", "ARTWORK-LICENSE.txt", "LICENSE-PROVENANCE.json"]:
            assert apk.read("assets/showcontrol-music/" + name) == (args.library / name).read_bytes()
        assert not any("qasharereceiver" in name.lower() or "protectionprobe" in name.lower() for name in apk.namelist())
        with args.apk.open("rb") as file:
            file.seek(entry.header_offset)
            header = file.read(30)
            assert header[:4] == b"PK\x03\x04"
            name_size, extra_size = struct.unpack_from("<HH", header, 26)
            start = entry.header_offset + 30 + name_size + extra_size
            with zipfile.ZipFile(Slice(file, start, entry.file_size)) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                assert manifest["format"] == "show-control-library" and manifest["schemaVersion"] == 2
                show = manifest["shows"][0]
                assert len(manifest["shows"]) == 1 and len(show["sets"]) == 20
                assert len(show["media"]) == 170 and len(show["visualAssets"]) == 20
                declarations = {item["path"]: item for item in manifest["files"]}
                assert len(declarations) == 190
                actual = {}
                for item in archive.infolist():
                    if item.filename == "manifest.json":
                        continue
                    assert item.compress_type == zipfile.ZIP_STORED
                    declaration = declarations.pop(item.filename)
                    assert item.file_size == declaration["bytes"]
                    with archive.open(item) as stream:
                        checksum = digest(stream)  # ZipExtFile also checks the CRC at EOF.
                    assert checksum == declaration["sha256"]
                    if item.filename.startswith("media/"):
                        assert checksum in expected and expected[checksum] == item.file_size
                        assert checksum not in actual
                        actual[checksum] = item.file_size
                assert not declarations and set(actual) == set(expected)
                assert all(cue.get("notes") for cue in show["cues"].values() if cue["type"] == "audio")
    with args.apk.open("rb") as stream:
        apk_hash = digest(stream)
    report = {"apk": str(args.apk.resolve()), "bytes": args.apk.stat().st_size, "sha256": apk_hash,
              "archiveSha256": description["sha256"], "audioFiles": 170, "distinctAudioHashes": 170,
              "audioBytes": sum(actual.values()), "artworkFiles": 20, "playlists": 20,
              "payloadCrcAndShaChecks": 190, "allSongNotesPresent": True, "attributionAssetsMatch": True,
              "outerArchiveStored": True, "boundedStreamingVerification": True}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
