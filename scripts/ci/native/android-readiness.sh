#!/usr/bin/env bash

# Print a direct focus identity, or on API 29 the unique eligible window on the
# top-focused display, only with visible system bars and no visible ANR alert.
# Callers still require repeated identical samples.
android_canonical_sdk_root() {
	local root=$1
	[ -n "$root" ] && [ -d "$root" ] || return 1
	(CDPATH= cd -- "$root" && pwd -P)
}

android_resolve_sdk_root() {
	local android_home=${ANDROID_HOME:-} sdk_root=${ANDROID_SDK_ROOT:-} home_real sdk_real
	if [ -n "$android_home" ] && [ -n "$sdk_root" ]; then
		home_real=$(android_canonical_sdk_root "$android_home") || {
			printf 'ANDROID_HOME is not an existing SDK directory: %s\n' "$android_home" >&2
			return 1
		}
		sdk_real=$(android_canonical_sdk_root "$sdk_root") || {
			printf 'ANDROID_SDK_ROOT is not an existing SDK directory: %s\n' "$sdk_root" >&2
			return 1
		}
		[ "$home_real" = "$sdk_real" ] || {
			printf 'Android SDK roots disagree: ANDROID_HOME=%s ANDROID_SDK_ROOT=%s\n' "$home_real" "$sdk_real" >&2
			return 1
		}
		printf '%s\n' "$home_real"
		return 0
	fi
	android_canonical_sdk_root "${android_home:-$sdk_root}" || {
		printf 'Set ANDROID_HOME or ANDROID_SDK_ROOT to an existing Android SDK directory.\n' >&2
		return 1
	}
}

android_emulator_binary() {
	printf '%s/emulator/emulator\n' "$1"
}

android_ensure_emulator() {
	local sdk_root=$1 emulator sdkmanager
	emulator=$(android_emulator_binary "$sdk_root")
	if [ ! -x "$emulator" ]; then
		sdkmanager="$sdk_root/cmdline-tools/latest/bin/sdkmanager"
		[ -x "$sdkmanager" ] || {
			printf 'Android emulator is missing and sdkmanager is unavailable: %s\n' "$sdkmanager" >&2
			return 1
		}
		printf 'Installing only the Android SDK emulator package from %s\n' "$sdk_root" >&2
		"$sdkmanager" emulator < /dev/null >&2 || {
			printf 'sdkmanager failed to install the Android emulator package.\n' >&2
			return 1
		}
	fi
	[ -x "$emulator" ] || {
		printf 'Android emulator package did not provide an executable: %s\n' "$emulator" >&2
		return 1
	}
	printf '%s\n' "$emulator"
}

android_verify_emulator_path() {
	local sdk_root=$1 expected resolved
	expected=$(android_emulator_binary "$sdk_root")
	resolved=$(type -P emulator 2>/dev/null || true)
	[ "$resolved" = "$expected" ] || {
		printf 'PATH emulator does not resolve to the selected Android SDK: expected=%s actual=%s\n' "$expected" "${resolved:-<missing>}" >&2
		return 1
	}
}

android_window_readiness_identity() {
	local dump identity
	dump=$(cat)
	[[ -n "$dump" ]] || return 1
	if grep -Eiq 'Window\{[^}]*Application Not Responding:' <<< "$dump"; then
		return 1
	fi
	if grep -Eq '^[[:space:]]*mCurrentFocus=' <<< "$dump"; then
		identity=$(sed -n 's/^[[:space:]]*mCurrentFocus=//p' <<< "$dump" | head -n 1)
		[[ "$identity" == Window\{* ]] || return 1
	else
		# API 29 windows dumps omit mCurrentFocus; accept only one surfaced,
		# visible, touchable/focusable app window on the top-focused display.
		identity=$(printf '%s\n' "$dump" | awk '
			function finish_window() {
				if (window != "" && display != "" && base_application &&
				    !not_focusable && !not_touchable && surface_ready && on_screen && visible) {
					candidate_count[display]++
					candidate[display] = window
				}
			}
			/^  Window #[0-9]+ / {
				finish_window()
				window = $0
				sub(/^  Window #[0-9]+ /, "", window)
				sub(/:$/, "", window)
				display = ""; base_application = 0; not_focusable = 0; not_touchable = 0
				surface_ready = 0; on_screen = 0; visible = 0
			}
			/^  mTopFocusedDisplayId=/ {
				top_display = $0
				sub(/^  mTopFocusedDisplayId=/, "", top_display)
			}
			/^[[:space:]]+mDisplayId=/ {
				display = $0
				sub(/^.*mDisplayId=/, "", display)
				sub(/[[:space:]].*$/, "", display)
			}
			/ty=BASE_APPLICATION/ { base_application = 1 }
			/^[[:space:]]+fl=/ {
				if ($0 ~ /NOT_FOCUSABLE/) not_focusable = 1
				if ($0 ~ /NOT_TOUCHABLE/) not_touchable = 1
			}
			/mHasSurface=true isReadyForDisplay\(\)=true/ { surface_ready = 1 }
			/^[[:space:]]+isOnScreen=true/ { on_screen = 1 }
			/^[[:space:]]+isVisible=true/ { visible = 1 }
			END {
				finish_window()
				if (top_display != "" && candidate_count[top_display] == 1) print candidate[top_display]
				else exit 1
			}
		') || return 1
		[[ "$identity" == Window\{* ]] || return 1
	fi
	printf '%s\n' "$dump" | awk '
		/^  Window #[0-9]+ / {
			status = ($0 ~ / u0 StatusBar\}/)
			navigation = ($0 ~ / u0 NavigationBar0\}/)
		}
		status && /isVisible=true/ { status_visible = 1; status = 0 }
		navigation && /isVisible=true/ { navigation_visible = 1; navigation = 0 }
		END { exit !(status_visible && navigation_visible) }
	' || return 1
	printf '%s\n' "$identity"
}

android_anr_seen() {
	grep -Eiq 'ANR in ' "$1"
}

android_kvm_accel_check_usable() {
	grep -Eiq 'KVM.*installed and usable'
}

android_cpuinfo_processor_count() {
	awk '/^processor[[:space:]]*:/ { count++ } END { print count+0 }'
}

android_is_owned_child_matching() {
	local pid=$1 command_pattern=$2 child_parent child_command
	child_parent=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
	child_command=$(ps -o command= -p "$pid" 2>/dev/null)
	[ "$child_parent" = "$$" ] || return 1
	# shellcheck disable=SC2254 # command_pattern is intentionally a caller-supplied glob.
	case "$child_command" in
		$command_pattern) return 0 ;;
		*) return 1 ;;
	esac
}

android_run_if_emulator_started() {
	local emulator_pid=$1
	shift
	[ -n "$emulator_pid" ] || return 0
	"$@"
}
