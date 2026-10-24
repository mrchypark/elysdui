#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
source "$ROOT/scripts/ci/native/android-readiness.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
sdk_root="$tmp/sdk"
other_sdk_root="$tmp/other-sdk"
calls="$tmp/sdkmanager-calls"
mkdir -p "$sdk_root/cmdline-tools/latest/bin" "$other_sdk_root"

cat > "$sdk_root/cmdline-tools/latest/bin/sdkmanager" <<'FAKE_SDKMANAGER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_SDKMANAGER_CALLS"
[[ "$#" -eq 1 && "$1" == emulator ]] || exit 90
[[ "${FAKE_SDKMANAGER_MODE:-install}" == install ]] || exit 0
mkdir -p "$FAKE_SDK_ROOT/emulator"
cat > "$FAKE_SDK_ROOT/emulator/emulator" <<'FAKE_EMULATOR'
#!/usr/bin/env bash
[[ "${1:-}" == -version ]] || exit 91
printf '%s\n' 'Android emulator fake version 1'
FAKE_EMULATOR
chmod +x "$FAKE_SDK_ROOT/emulator/emulator"
FAKE_SDKMANAGER
chmod +x "$sdk_root/cmdline-tools/latest/bin/sdkmanager"

export ANDROID_HOME="$sdk_root" ANDROID_SDK_ROOT="$sdk_root"
export FAKE_SDK_ROOT="$sdk_root" FAKE_SDKMANAGER_CALLS="$calls"
resolved=$(android_resolve_sdk_root)
[[ "$resolved" == "$(cd "$sdk_root" && pwd -P)" ]]

emulator_binary=$(android_ensure_emulator "$resolved")
[[ "$emulator_binary" == "$resolved/emulator/emulator" ]]
[[ -x "$emulator_binary" ]]
[[ "$(<"$calls")" == emulator ]]
export PATH="$resolved/emulator:$PATH"
hash -r
android_verify_emulator_path "$resolved"
[[ "$("$emulator_binary" -version)" == 'Android emulator fake version 1' ]]

# An already-installed package is a no-op; do not run sdkmanager again.
android_ensure_emulator "$resolved" >/dev/null
[[ "$(wc -l < "$calls" | tr -d ' ')" == 1 ]]

# Conflicting Android SDK variables fail closed rather than selecting a second SDK.
export ANDROID_SDK_ROOT="$other_sdk_root"
if android_resolve_sdk_root >/dev/null 2>&1; then
	echo 'conflicting SDK roots unexpectedly resolved' >&2
	exit 1
fi
export ANDROID_SDK_ROOT="$sdk_root"

# A successful sdkmanager exit without the required executable is still a failure.
broken_sdk_root="$tmp/broken-sdk"
mkdir -p "$broken_sdk_root/cmdline-tools/latest/bin"
cp "$sdk_root/cmdline-tools/latest/bin/sdkmanager" "$broken_sdk_root/cmdline-tools/latest/bin/sdkmanager"
chmod +x "$broken_sdk_root/cmdline-tools/latest/bin/sdkmanager"
export FAKE_SDK_ROOT="$broken_sdk_root" FAKE_SDKMANAGER_MODE=noop
if android_ensure_emulator "$broken_sdk_root" >/dev/null 2>&1; then
	echo 'missing emulator after successful sdkmanager unexpectedly passed' >&2
	exit 1
fi

echo 'Android SDK emulator provisioning checks passed.'
