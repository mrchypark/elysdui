#!/usr/bin/env bash
# Keep the existing CI entry point; Python supplies portable bounded subprocesses.
set -euo pipefail
exec python3 "$(dirname "$0")/ios-simulator.py" prepare
