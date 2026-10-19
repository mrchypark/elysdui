#!/usr/bin/env python3
"""Copy only the bounded, test-owned focus counterexample diagnostics."""
import json
import subprocess
import sys
from pathlib import Path


def export(destination, serial="emulator-5554", run=subprocess.run):
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []
    # Active-window root text has no source size cap and is intentionally excluded.
    for case in ("baseline", "persistent-dialog", "transient-dialog"):
        for kind in ("windows", "activities", "last-anr"):
            name = f"{case}-{kind}.txt"
            command = ["adb", "-s", serial, "exec-out", "run-as", "dev.ely.nativeprofile",
                       "cat", f"cache/focus-counterexamples/{name}"]
            entry = {"file": name, "command": command}
            try:
                result = run(command, capture_output=True, timeout=3, check=False)
                entry["exit"] = result.returncode
                entry["stderr"] = result.stderr[:4096].decode("utf-8", "replace")
                if result.returncode == 0 and len(result.stdout) <= 132 * 1024:
                    (destination / name).write_bytes(result.stdout)
                    entry["bytes"] = len(result.stdout)
                elif result.returncode == 0:
                    entry["error"] = "unexpected output beyond bounded diagnostic size"
            except subprocess.TimeoutExpired:
                entry["error"] = "diagnostic copy exceeded 3 seconds"
            except OSError as error:
                entry["error"] = f"diagnostic command unavailable: {type(error).__name__}"
            manifest.append(entry)
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    export(Path(sys.argv[1]))
