#!/usr/bin/env python3
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("focus_export", Path(__file__).with_name("export-focus-diagnostics.py"))
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
NAMES = [f"{case}-{kind}.txt" for case in ("baseline", "persistent-dialog", "transient-dialog")
         for kind in ("windows", "activities", "last-anr")]
HEADER = b"elapsedRealtime=123\noriginal=java.lang.AssertionError: Window focus missing after 350ms\n"


class FocusDiagnosticsTest(unittest.TestCase):
    def source_file(self, source, name, data, device="device"):
        path = source / "debugAndroidTest/connected" / device / "focus-counterexamples" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def manifest(self, destination):
        return json.loads((destination / "manifest.json").read_text())

    def test_only_fixed_bounded_test_owned_files_are_exported(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, destination = Path(temporary) / "utp", Path(temporary) / "export"
            for name in NAMES:
                self.source_file(source, name, HEADER + b"bounded diagnostic")
            self.source_file(source, "persistent-dialog-active-window.txt", b"unbounded private root")
            exporter.export(source, destination)
            self.assertEqual({p.name for p in destination.glob("*.txt")}, set(NAMES))
            manifest = self.manifest(destination)
            self.assertEqual([x["file"] for x in manifest], NAMES)
            self.assertTrue(all(x["status"] == "copied" for x in manifest))
            self.assertTrue(all(p.read_bytes() == HEADER + b"bounded diagnostic" for p in destination.glob("*.txt")))

    def test_missing_error_text_and_oversized_files_never_become_diagnostics(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, destination = Path(temporary) / "utp", Path(temporary) / "export"
            destination.mkdir()
            for name in NAMES:
                (destination / name).write_bytes(b"stale prior contents")
            self.source_file(source, NAMES[1], b"run-as: unknown package: dev.ely.nativeprofile\n")
            self.source_file(source, NAMES[2], HEADER + b"x" * exporter.MAX_BYTES)
            self.source_file(source, NAMES[3], b"elapsedRealtime=123\noriginal=\n")
            self.source_file(source, NAMES[4], b"elapsedRealtime=wrong\noriginal=error\n")
            exporter.export(source, destination)
            self.assertEqual(list(destination.glob("*.txt")), [])
            manifest = self.manifest(destination)
            self.assertEqual(len(manifest), 9)
            self.assertEqual(manifest[0]["status"], "missing")
            self.assertEqual(manifest[1]["error"], "invalid diagnostic header")
            self.assertEqual(manifest[2]["error"], "unexpected output beyond bounded diagnostic size")
            self.assertTrue(all(x["error"] == "invalid diagnostic header" for x in manifest[3:5]))
            self.assertTrue(all(x["status"] == "missing" for x in manifest[5:]))
            self.assertTrue(all("bytes" not in x for x in manifest))

    def test_ambiguous_nonregular_and_symlink_sources_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, destination = Path(temporary) / "utp", Path(temporary) / "export"
            self.source_file(source, NAMES[0], HEADER, "first")
            self.source_file(source, NAMES[0], HEADER, "second")
            directory = self.source_file(source, NAMES[1], b"")
            directory.unlink()
            directory.mkdir()
            link = self.source_file(source, NAMES[2], b"")
            link.unlink()
            outside = Path(temporary) / "outside"
            outside.write_bytes(HEADER)
            link.symlink_to(outside)
            exporter.export(source, destination)
            self.assertEqual(list(destination.glob("*.txt")), [])
            manifest = self.manifest(destination)
            self.assertEqual(manifest[0]["error"], "ambiguous diagnostic sources")
            self.assertTrue(all(x["error"] == "diagnostic source is not a regular contained file" for x in manifest[1:3]))

    def test_exact_limit_and_unrelated_original_exception_are_valid(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, destination = Path(temporary) / "utp", Path(temporary) / "export"
            header = b"elapsedRealtime=0\noriginal=java.lang.IllegalStateException: unrelated failure\n"
            data = header + b"x" * (exporter.MAX_BYTES - len(header))
            self.source_file(source, NAMES[0], data)
            exporter.export(source, destination)
            self.assertEqual((destination / NAMES[0]).read_bytes(), data)
            self.assertEqual(self.manifest(destination)[0]["bytes"], exporter.MAX_BYTES)


if __name__ == "__main__":
    unittest.main()
