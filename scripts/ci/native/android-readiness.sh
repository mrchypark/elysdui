#!/usr/bin/env bash

# Print the focused window only when Window Manager shows a stable-ready system
# surface and no visible ANR alert. Callers still require repeated identical samples.
android_window_readiness_focus() {
	local dump focus
	dump=$(cat)
	[[ -n "$dump" ]] || return 1
	if grep -Eiq 'Window\{[^}]*Application Not Responding:' <<< "$dump"; then
		return 1
	fi
	focus=$(sed -n 's/^[[:space:]]*mCurrentFocus=//p' <<< "$dump" | head -n 1)
	[[ "$focus" == Window\{* ]] || return 1
	printf '%s\n' "$dump" | awk '
		/^  Window #[0-9]+ / {
			status = ($0 ~ / u0 StatusBar\}/)
			navigation = ($0 ~ / u0 NavigationBar0\}/)
		}
		status && /isVisible=true/ { status_visible = 1; status = 0 }
		navigation && /isVisible=true/ { navigation_visible = 1; navigation = 0 }
		END { exit !(status_visible && navigation_visible) }
	' || return 1
	printf '%s\n' "$focus"
}

android_anr_seen() {
	grep -Eiq 'ANR in ' "$1"
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
