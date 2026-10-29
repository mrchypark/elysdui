#!/usr/bin/env bash
set -euo pipefail
trap 'status=$?; printf "AVD config regression failed at %s:%s: %s (status %s)\n" "${BASH_SOURCE[0]}" "$LINENO" "$BASH_COMMAND" "$status" >&2; exit "$status"' ERR
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
source "$ROOT/scripts/ci/native/android-readiness.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
manager="$tmp/avdmanager"
mkdir -p "$tmp/inherited-avd-home" "$tmp/elsewhere"
cat > "$manager" <<'FAKE_AVDMANAGER'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-} ${2:-} ${3:-}" in
	'create avd --force')
		[[ "$ANDROID_AVD_HOME" == "$FAKE_EXPECTED_AVD_HOME" ]]
		[[ " $* " == *" --path $ANDROID_AVD_HOME/ely-profile.avd "* ]]
		[[ "$(cat)" == no ]]
		printf '%s\n' 'Auto-selecting single ABI x86_64'
		if [[ "${FAKE_AVD_MODE:-create}" == create ]]; then
			mkdir -p "$ANDROID_AVD_HOME/ely-profile.avd"
			printf '%s\n' 'avd.ini.encoding=UTF-8' 'hw.cpu.ncore=2' 'hw.lcd.width=1080' > "$ANDROID_AVD_HOME/ely-profile.avd/config.ini"
		elif [[ "${FAKE_AVD_MODE:-create}" == missing ]]; then
			:
		else
			mkdir -p "$FAKE_OTHER_AVD_HOME/ely-profile.avd"
			printf '%s\n' 'avd.ini.encoding=UTF-8' > "$FAKE_OTHER_AVD_HOME/ely-profile.avd/config.ini"
		fi
		;;
	'list avd -c')
		if [[ "${FAKE_AVD_MODE:-create}" == create ]]; then
			printf '%s\n' 'ely-profile'
		elif [[ "${FAKE_AVD_MODE:-create}" == missing ]]; then
			printf '%s\n' 'ely-profile'
		else
			printf '%s\n' 'ely-profile'
		fi
		;;
	*)
		echo "unexpected avdmanager invocation: $*" >&2
		exit 2
		;;
esac
FAKE_AVDMANAGER
chmod +x "$manager"

export ANDROID_AVD_HOME="$tmp/inherited-avd-home"
export FAKE_EXPECTED_AVD_HOME="$tmp/selected-avd-home"
android_set_avd_home "$FAKE_EXPECTED_AVD_HOME"
[[ "$ANDROID_AVD_HOME" == "$(cd "$FAKE_EXPECTED_AVD_HOME" && pwd -P)" ]]
android_create_avd "$manager" ely-profile 'system-images;android-29;default;x86_64'
config="$ANDROID_AVD_HOME/ely-profile.avd/config.ini"
android_configure_avd_display "$config"
grep -Fxq 'avd.ini.encoding=UTF-8' "$config"
grep -Fxq 'hw.cpu.ncore=2' "$config"
[[ "$(grep -c '^hw.lcd.width=' "$config")" == 1 ]]
grep -Fxq 'hw.lcd.width=720' "$config"
grep -Fxq 'hw.lcd.height=1280' "$config"
grep -Fxq 'hw.lcd.density=240' "$config"
grep -Fxq 'skin.name=720x1280' "$config"
grep -Fxq 'skin.path=720x1280' "$config"
grep -Fxq 'skin.dynamic=yes' "$config"

# A manager that lists the expected AVD but leaves its config absent still fails.
export FAKE_AVD_MODE=missing
export FAKE_EXPECTED_AVD_HOME="$tmp/listed-but-missing-home"
android_set_avd_home "$tmp/listed-but-missing-home"
if output=$(android_create_avd "$manager" ely-profile 'system-images;android-29;default;x86_64' 2>&1); then
	echo 'AVD with a missing config.ini unexpectedly passed' >&2
	exit 1
fi
[[ "$output" == *"$ANDROID_AVD_HOME/ely-profile.avd/config.ini"* ]]

# A successful manager exit that lists the AVD elsewhere must not be treated as
# proof of the requested config path; compact mode reports its name, not its path.
export FAKE_AVD_MODE=misdirect
export FAKE_OTHER_AVD_HOME="$tmp/elsewhere"
export FAKE_EXPECTED_AVD_HOME="$tmp/expected-but-not-created"
android_set_avd_home "$tmp/expected-but-not-created"
if output=$(android_create_avd "$manager" ely-profile 'system-images;android-29;default;x86_64' 2>&1); then
	echo 'AVD manager path mismatch unexpectedly passed' >&2
	exit 1
fi
[[ "$output" == *"$ANDROID_AVD_HOME/ely-profile.avd/config.ini"* ]]

echo 'Android AVD home and config-path checks passed.'
