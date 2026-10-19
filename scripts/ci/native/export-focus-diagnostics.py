#!/usr/bin/env python3
"""Validate only the bounded, test-owned diagnostics already copied by Gradle UTP."""
import json
import re
import sys
from pathlib import Path

MAX_BYTES = 132 * 1024
HEADER = re.compile(rb"elapsedRealtime=[0-9]+\noriginal=[^\r\n]+\n")


def export(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []
    # UTP copies this output before uninstall. Never read private app files after teardown.
    # Active-window root text has no source size cap and stays outside this allowlist.
    for case in ("baseline", "persistent-dialog", "transient-dialog"):
        for kind in ("windows", "activities", "last-anr"):
            name = f"{case}-{kind}.txt"
            target = destination / name
            entry = {"file": name}
            try:
                target.unlink(missing_ok=True)
                candidates = list(source.glob(f"debugAndroidTest/connected/*/focus-counterexamples/{name}"))
                if not candidates:
                    entry["status"] = "missing"
                elif len(candidates) != 1:
                    entry.update(status="rejected", error="ambiguous diagnostic sources")
                else:
                    path = candidates[0]
                    entry["source"] = str(path.relative_to(source))
                    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(source.resolve()):
                        entry.update(status="rejected", error="diagnostic source is not a regular contained file")
                    else:
                        with path.open("rb") as stream:
                            data = stream.read(MAX_BYTES + 1)
                        if len(data) > MAX_BYTES:
                            entry.update(status="rejected", error="unexpected output beyond bounded diagnostic size")
                        elif not HEADER.match(data):
                            entry.update(status="rejected", error="invalid diagnostic header")
                        else:
                            target.write_bytes(data)
                            entry.update(status="copied", bytes=len(data))
            except OSError as error:
                entry.update(status="rejected", error=f"diagnostic copy unavailable: {type(error).__name__}")
            manifest.append(entry)
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    export(Path(sys.argv[1]), Path(sys.argv[2]))
