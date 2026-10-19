#!/usr/bin/env python3
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("focus_export", Path(__file__).with_name("export-focus-diagnostics.py"))
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class FocusDiagnosticsTest(unittest.TestCase):
    def test_only_fixed_bounded_test_owned_files_are_exported(self):
        calls = []

        def run(command, **kwargs):
            self.assertEqual(kwargs, {"capture_output": True, "timeout": 3, "check": False})
            calls.append(command)
            return subprocess.CompletedProcess(command, 0, b"bounded diagnostic", b"")

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary)
            exporter.export(destination, run=run)
            expected = {f"{case}-{kind}.txt" for case in ("baseline", "persistent-dialog", "transient-dialog")
                        for kind in ("windows", "activities", "last-anr")}
            self.assertEqual({p.name for p in destination.glob("*.txt")}, expected)
            self.assertEqual(len(calls), 9)
            for command in calls:
                self.assertEqual(command[:7], ["adb", "-s", "emulator-5554", "exec-out", "run-as", "dev.ely.nativeprofile", "cat"])
                self.assertIn(command[7], {f"cache/focus-counterexamples/{name}" for name in expected})
            self.assertTrue(all(p.read_bytes() == b"bounded diagnostic" for p in destination.glob("*.txt")))

    def test_timeout_missing_and_oversized_files_never_become_diagnostics(self):
        count = 0

        def run(command, **kwargs):
            nonlocal count
            count += 1
            if count == 1:
                raise subprocess.TimeoutExpired(command, 3)
            if count == 2:
                raise FileNotFoundError("adb absent")
            if count == 3:
                return subprocess.CompletedProcess(command, 0, b"x" * (132 * 1024 + 1), b"")
            return subprocess.CompletedProcess(command, 1, b"missing", b"not present")

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary)
            exporter.export(destination, run=run)
            self.assertEqual(list(destination.glob("*.txt")), [])
            manifest = json.loads((destination / "manifest.json").read_text())
            self.assertEqual(len(manifest), 9)
            self.assertEqual(manifest[0]["error"], "diagnostic copy exceeded 3 seconds")
            self.assertEqual(manifest[1]["error"], "diagnostic command unavailable: FileNotFoundError")
            self.assertEqual(manifest[2]["error"], "unexpected output beyond bounded diagnostic size")
            self.assertTrue(all(item["exit"] == 1 for item in manifest[3:]))


if __name__ == "__main__":
    unittest.main()
