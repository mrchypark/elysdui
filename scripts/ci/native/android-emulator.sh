#!/usr/bin/env bash
# Run on a macOS Intel host with Java 21 and an already licensed Android SDK.
# This script never accepts SDK licenses or changes host security permissions.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT"
RESULTS="$ROOT/test-results/android-native"
mkdir -p "$RESULTS"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?An existing Android SDK is required}}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
SERIAL=emulator-5554
SERVER_PID=
CONTROLS_PID=
EMULATOR_PID=
cleanup() {
  result=$?
  set +e
  adb -s "$SERIAL" logcat -d > "$RESULTS/logcat.txt" 2>&1
  adb -s "$SERIAL" shell dumpsys activity lastanr > "$RESULTS/last-anr.txt" 2>&1
  adb -s "$SERIAL" shell cat /proc/meminfo > "$RESULTS/meminfo.txt" 2>&1
  adb -s "$SERIAL" shell cat /proc/pressure/cpu > "$RESULTS/cpu-pressure.txt" 2>&1
  adb -s "$SERIAL" pull /sdcard/Android/data/dev.ely.nativeprofile/files/screenshots "$RESULTS/"
  python3 "$ROOT/scripts/ci/native/export-focus-diagnostics.py" \
    "$ROOT/adapters/android/app/build/outputs/connected_android_test_additional_output" \
    "$RESULTS/focus-counterexamples"
  if [ -n "$EMULATOR_PID" ]; then kill "$EMULATOR_PID" 2>/dev/null; fi
  if [ -n "$CONTROLS_PID" ]; then kill "$CONTROLS_PID" 2>/dev/null; fi
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null; fi
  exit "$result"
}
trap cleanup EXIT

# The app has no Google Play dependency. Use the lighter Android 10 / API 29
# AOSP runtime: the API 35 guest saturated its single virtual CPU and produced
# system_server ANRs on this hosted runner. App compile/target SDK stays at 35.
# stdin is closed: fail rather than accepting new/unexpected license terms.
SYSTEM_IMAGE='system-images;android-29;default;x86_64'
sysctl hw.ncpu hw.memsize | tee "$RESULTS/host-resources.txt"
sdkmanager "$SYSTEM_IMAGE" < /dev/null
printf 'no\n' | avdmanager create avd --force --name ely-profile --device pixel_2 --package "$SYSTEM_IMAGE"
# Reduce software-rendering work while keeping a useful phone-sized dp viewport.
python3 - <<'PY'
from pathlib import Path
path = Path.home() / '.android/avd/ely-profile.avd/config.ini'
values = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
values.update({'hw.lcd.width': '720', 'hw.lcd.height': '1280', 'hw.lcd.density': '240',
               'skin.name': '720x1280', 'skin.path': '720x1280', 'skin.dynamic': 'yes'})
path.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
PY
emulator -accel-check
emulator -avd ely-profile -port 5554 -cores 2 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -accel on > "$RESULTS/emulator.log" 2>&1 &
EMULATOR_PID=$!
BOOT_DEADLINE=$((SECONDS + 600))
while [ "$SECONDS" -lt "$BOOT_DEADLINE" ]; do
  kill -0 "$EMULATOR_PID" || { cat "$RESULTS/emulator.log"; exit 1; }
  if [ "$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then break; fi
  sleep 2
done
if [ "$(adb -s "$SERIAL" shell getprop sys.boot_completed | tr -d '\r')" != 1 ]; then
  echo 'Android did not complete first boot within 10 minutes.' >&2
  cat "$RESULTS/emulator.log"
  exit 1
fi
echo 'Android 10 / API 29 emulator boot completed; starting real native UI tests.'
adb -s "$SERIAL" shell input keyevent 82
adb -s "$SERIAL" shell getprop ro.build.fingerprint > "$RESULTS/device.txt"

SERVER_BINARY="${RUNNER_TEMP:-/tmp}/ely-native-emulator-profile"
go build -o "$SERVER_BINARY" ./examples/native-profile
"$SERVER_BINARY" > "$RESULTS/server.log" 2>&1 &
SERVER_PID=$!
"$SERVER_BINARY" -controls -port 8095 > "$RESULTS/controls-server.log" 2>&1 &
CONTROLS_PID=$!
for attempt in $(seq 1 30); do
  curl --fail --silent http://127.0.0.1:8094/ > /dev/null && \
    curl --fail --silent http://127.0.0.1:8095/ > /dev/null && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:8094/ > /dev/null
curl --fail --silent http://127.0.0.1:8095/ > /dev/null
# sys.boot_completed does not guarantee that the guest network is ready. Check
# the same host-loopback bridge used by the app before launching instrumentation.
# The favicon route has no session/cookie data and always returns HTTP 204.
NETWORK_DEADLINE=$((SECONDS + 120))
NETWORK_READY=false
while [ "$SECONDS" -lt "$NETWORK_DEADLINE" ]; do
  response=$(adb -s "$SERIAL" shell "printf 'GET /favicon.ico HTTP/1.0\\r\\nHost: 10.0.2.2:8094\\r\\n\\r\\n' | toybox nc -w 5 -W 5 10.0.2.2 8094" 2>&1 || true)
  status=$(printf '%s\n' "$response" | tr -d '\r' | head -n 1)
  printf '%s\n' "$status" >> "$RESULTS/host-connectivity.log"
  if [[ "$status" == HTTP/*' 204 '* ]]; then NETWORK_READY=true; break; fi
  sleep 2
done
if [ "$NETWORK_READY" != true ]; then
  echo 'The Android guest could not reach the Go server through 10.0.2.2:8094.' >&2
  cat "$RESULTS/host-connectivity.log"
  adb -s "$SERIAL" shell ip address > "$RESULTS/network-addresses.txt" 2>&1 || true
  adb -s "$SERIAL" shell ip route > "$RESULTS/network-routes.txt" 2>&1 || true
  exit 1
fi
echo 'Android guest reached the Go server through the app host-loopback bridge.'
cd adapters/android
ANDROID_SERIAL="$SERIAL" ./gradlew --no-daemon :app:connectedDebugAndroidTest
