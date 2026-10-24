#!/usr/bin/env bash
# Run on an x86_64 Linux host with Java 21, an already licensed Android SDK,
# and directly accessible KVM. This script never accepts licenses or changes
# host permissions; unavailable KVM is a hard failure, not a software fallback.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT"
source "$ROOT/scripts/ci/native/android-readiness.sh"
RESULTS="$ROOT/test-results/android-native"
mkdir -p "$RESULTS"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?An existing Android SDK is required}}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
SERIAL=emulator-5554
SERVER_PID=
CONTROLS_PID=
EMULATOR_PID=
ANR_WATCH_PID=
cleanup() {
  result=$?
  set +e
	if [ -n "$ANR_WATCH_PID" ]; then
		if kill -0 "$ANR_WATCH_PID" 2>/dev/null; then
			if android_is_owned_child_matching "$ANR_WATCH_PID" '*adb*logcat*ActivityManager*'; then
				kill "$ANR_WATCH_PID" 2>/dev/null
				wait "$ANR_WATCH_PID" 2>/dev/null
			else
				echo "Refusing to signal unverified ANR watcher PID $ANR_WATCH_PID" >&2
			fi
		else
			wait "$ANR_WATCH_PID" 2>/dev/null
		fi
	fi
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

# The workflow builds both APKs before this script; keep the guard test pre-emulator too.
bash "$ROOT/scripts/ci/native/test-android-readiness.sh"

# The app has no Google Play dependency. Use the lighter Android 10 / API 29
# AOSP runtime: the API 35 guest saturated its single virtual CPU and produced
# system_server ANRs on this hosted runner. App compile/target SDK stays at 35.
# stdin is closed: fail rather than accepting new/unexpected license terms.
SYSTEM_IMAGE='system-images;android-29;default;x86_64'
{
	printf 'host.cpu_count: %s\n' "$(getconf _NPROCESSORS_ONLN)"
	awk '/^MemTotal:/ { printf "host.memory_bytes: %.0f\n", $2 * 1024 }' /proc/meminfo
} | tee "$RESULTS/host-resources.txt"
if [ ! -c /dev/kvm ] || [ ! -r /dev/kvm ] || [ ! -w /dev/kvm ]; then
	echo 'KVM preflight failed: /dev/kvm is not an accessible read/write character device; refusing permission changes.' >&2
	ls -l /dev/kvm > "$RESULTS/kvm-device.txt" 2>&1 || true
	cat "$RESULTS/kvm-device.txt" >&2
	exit 1
fi
if ! emulator -accel-check > "$RESULTS/kvm-accel-check.txt" 2>&1; then
	echo 'KVM preflight failed: emulator -accel-check returned failure.' >&2
	cat "$RESULTS/kvm-accel-check.txt" >&2
	exit 1
fi
if ! android_kvm_accel_check_usable < "$RESULTS/kvm-accel-check.txt"; then
	echo 'KVM preflight failed: emulator did not report usable KVM acceleration.' >&2
	cat "$RESULTS/kvm-accel-check.txt" >&2
	exit 1
fi
echo 'Accessible /dev/kvm and usable emulator acceleration confirmed without changing permissions.'
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
emulator -avd ely-profile -port 5554 -cores 2 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -accel on > "$RESULTS/emulator.log" 2>&1 &
EMULATOR_PID=$!
ANR_LOG="$RESULTS/system-anr-watch.log"
: > "$ANR_LOG"
BOOT_DEADLINE=$((SECONDS + 600))
while [ "$SECONDS" -lt "$BOOT_DEADLINE" ]; do
  kill -0 "$EMULATOR_PID" || { cat "$RESULTS/emulator.log"; exit 1; }
	if boot_state=$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r'); then
		if [ -z "$ANR_WATCH_PID" ]; then
			adb -s "$SERIAL" logcat -v brief ActivityManager:E '*:S' > "$ANR_LOG" 2>&1 &
			ANR_WATCH_PID=$!
		fi
		if [ "$boot_state" = 1 ]; then break; fi
	fi
  sleep 2
done
if [ "$(adb -s "$SERIAL" shell getprop sys.boot_completed | tr -d '\r')" != 1 ]; then
  echo 'Android did not complete first boot within 10 minutes.' >&2
  cat "$RESULTS/emulator.log"
  exit 1
fi
if ! adb -s "$SERIAL" shell cat /proc/cpuinfo > "$RESULTS/guest-cpuinfo.txt" 2>&1; then
	echo 'Android guest CPU count could not be observed; refusing instrumentation.' >&2
	cat "$RESULTS/guest-cpuinfo.txt" >&2
	exit 1
fi
GUEST_CPU_COUNT=$(android_cpuinfo_processor_count < "$RESULTS/guest-cpuinfo.txt")
printf 'guest_cpu_count=%s\n' "$GUEST_CPU_COUNT" | tee "$RESULTS/guest-cpu-count.txt"
if [ "$GUEST_CPU_COUNT" != 2 ]; then
	echo "Android guest exposed $GUEST_CPU_COUNT processors, expected exactly 2; refusing instrumentation." >&2
	exit 1
fi
echo 'Android 10 / API 29 emulator boot completed; starting real native UI tests.'
adb -s "$SERIAL" shell input keyevent 82
adb -s "$SERIAL" shell getprop ro.build.fingerprint > "$RESULTS/device.txt"

# Boot completion alone did not prevent the hosted guest's System UI ANR from
# obscuring the app. Require a responsive Window Manager view, visible system
# bars, and three identical focused-window samples before instrumentation.
READY_LOG="$RESULTS/system-readiness.log"
READY_DUMP="$RESULTS/system-readiness-window.txt"
READY_DEADLINE=$((SECONDS + 90))
# This run's SystemUI ANR surfaced about 36 seconds after boot completion.
READY_NOT_BEFORE=$((SECONDS + 60))
READY_WINDOW=
READY_STREAK=0
READY=false
: > "$READY_LOG"
while [ "$SECONDS" -lt "$READY_DEADLINE" ]; do
	if ! kill -0 "$ANR_WATCH_PID" 2>/dev/null; then
		printf '%s system-anr-watch-stopped\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
		break
	fi
	if android_anr_seen "$ANR_LOG"; then
		printf '%s boot-anr-observed\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
		break
	fi
	ADB_PID=
	READY_COMMAND_DEADLINE=$((SECONDS + 5))
	if [ "$READY_COMMAND_DEADLINE" -gt "$READY_DEADLINE" ]; then READY_COMMAND_DEADLINE=$READY_DEADLINE; fi
	adb -s "$SERIAL" shell dumpsys window windows > "$READY_DUMP" 2>&1 &
	ADB_PID=$!
	while kill -0 "$ADB_PID" 2>/dev/null && [ "$SECONDS" -lt "$READY_COMMAND_DEADLINE" ]; do sleep 0.1; done
	if [ "$SECONDS" -ge "$READY_DEADLINE" ]; then
		if kill -0 "$ADB_PID" 2>/dev/null; then
			if android_is_owned_child_matching "$ADB_PID" '*adb*shell*dumpsys*window*'; then
				kill "$ADB_PID" 2>/dev/null || true
				wait "$ADB_PID" 2>/dev/null || true
			else
				printf '%s refused-to-signal-unverified-adb-pid=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$ADB_PID" >> "$READY_LOG"
				break
			fi
		fi
		printf '%s readiness-deadline-reached-during-window-query\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
		break
	fi
	if kill -0 "$ADB_PID" 2>/dev/null; then
		if android_is_owned_child_matching "$ADB_PID" '*adb*shell*dumpsys*window*'; then
			kill "$ADB_PID" 2>/dev/null || true
			wait "$ADB_PID" 2>/dev/null || true
		else
			printf '%s refused-to-signal-unverified-adb-pid=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$ADB_PID" >> "$READY_LOG"
		fi
		READY_WINDOW=
		READY_STREAK=0
		printf '%s window-dump-timeout\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
	elif ! wait "$ADB_PID"; then
		READY_WINDOW=
		READY_STREAK=0
		printf '%s window-dump-failed\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
	elif grep -Eiq 'Window\{[^}]*Application Not Responding:' "$READY_DUMP"; then
		printf '%s visible-anr-window\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
		break
	elif window_identity=$(android_window_readiness_identity < "$READY_DUMP"); then
		if [ "$window_identity" = "$READY_WINDOW" ]; then READY_STREAK=$((READY_STREAK + 1)); else READY_WINDOW=$window_identity; READY_STREAK=1; fi
		printf '%s ready-sample=%s window-identity=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$READY_STREAK" "$window_identity" >> "$READY_LOG"
		if [ "$READY_STREAK" -ge 3 ] && [ "$SECONDS" -ge "$READY_NOT_BEFORE" ] && [ "$SECONDS" -lt "$READY_DEADLINE" ]; then READY=true; break; fi
	else
		READY_WINDOW=
		READY_STREAK=0
		printf '%s window-identity-or-system-bars-unready\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
	fi
	if [ "$SECONDS" -ge "$READY_DEADLINE" ]; then
		printf '%s readiness-deadline-reached\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$READY_LOG"
		break
	fi
	remaining=$((READY_DEADLINE - SECONDS))
	if [ "$remaining" -gt 2 ]; then remaining=2; fi
	sleep "$remaining"
done
if [ "$READY" != true ]; then
	echo 'Android system readiness failed: no stable window identity with visible system bars and no ANR within 90 seconds.' >&2
	cat "$READY_LOG" >&2
	tail -n 80 "$ANR_LOG" >&2
	cat "$READY_DUMP" >&2
	exit 1
fi
echo 'Android system window identity and visible system bars settled before instrumentation.'

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
# Boot/network readiness does not prove that Gradle can discover device properties.
# This is an observation deadline, not a hard command timeout: no existing
# per-ADB timeout helper is available, and a hung adb can outlive the deadline.
DEVICE_DEADLINE=$(( $(date +%s) + 120 ))
DEVICE_READY=false
DEVICE_ATTEMPT=1
DEVICE_LOG="$RESULTS/pre-gradle-device-readiness.log"
printf '%s\n' 'Serial emulator-5554; expected API 29 / x86_64; at most 30 observations, 2s apart; 120s soft deadline (ADB commands are not individually time-bounded).' > "$DEVICE_LOG"
adb version >> "$DEVICE_LOG" 2>&1
while [ "$DEVICE_ATTEMPT" -le 30 ] && [ "$(date +%s)" -lt "$DEVICE_DEADLINE" ]; do
  printf '\n%s attempt=%s serial=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$DEVICE_ATTEMPT" "$SERIAL" >> "$DEVICE_LOG"
  if device_state=$(adb -s "$SERIAL" get-state 2>> "$DEVICE_LOG" | tr -d '\r'); then state_ok=true; else state_ok=false; fi
  if device_properties=$(adb -s "$SERIAL" shell getprop 2>> "$DEVICE_LOG" | tr -d '\r'); then properties_ok=true; else properties_ok=false; fi
  if package_path=$(adb -s "$SERIAL" shell pm path android 2>> "$DEVICE_LOG" | tr -d '\r'); then package_ok=true; else package_ok=false; fi
  device_sdk=$(printf '%s\n' "$device_properties" | awk -F '[][]' '$2=="ro.build.version.sdk" {print $4}')
  device_abi=$(printf '%s\n' "$device_properties" | awk -F '[][]' '$2=="ro.product.cpu.abi" {print $4}')
  printf 'state=%s\nsdk=%s\nabi=%s\npackage=%s\n%s\n' "$device_state" "$device_sdk" "$device_abi" "$package_path" "$device_properties" >> "$DEVICE_LOG"
  if [ "$state_ok" = true ] && [ "$properties_ok" = true ] && [ "$package_ok" = true ] && [ "$device_state" = device ] && [ "$device_sdk" = 29 ] && [ "$device_abi" = x86_64 ] && [ "$(date +%s)" -lt "$DEVICE_DEADLINE" ]; then
    case "$package_path" in package:/*) DEVICE_READY=true; break;; esac
  fi
  DEVICE_ATTEMPT=$((DEVICE_ATTEMPT + 1))
  if [ "$DEVICE_ATTEMPT" -le 30 ] && [ "$(date +%s)" -lt "$DEVICE_DEADLINE" ]; then sleep 2; fi
done
if [ "$DEVICE_READY" != true ]; then
  echo 'Exact Android device API/ABI/package readiness was not observed; refusing Gradle instrumentation.' >&2
  cat "$DEVICE_LOG" >&2
  exit 1
fi
echo 'Exact Android device API 29 / x86_64 and package service observed before Gradle.'
cd adapters/android
ANDROID_SERIAL="$SERIAL" ./gradlew --no-daemon :app:connectedDebugAndroidTest
