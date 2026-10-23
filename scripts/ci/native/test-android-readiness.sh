#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
source "$ROOT/scripts/ci/native/android-readiness.sh"

healthy=$(android_window_readiness_focus <<'WINDOWS'
  mCurrentFocus=Window{ab12 u0 com.android.launcher3/.Launcher}
  Window #0 Window{nav u0 NavigationBar0}:
    isVisible=true
  Window #1 Window{status u0 StatusBar}:
    isVisible=true
WINDOWS
)
[[ "$healthy" == 'Window{ab12 u0 com.android.launcher3/.Launcher}' ]]

anr_log=$(mktemp)
child_pid=
cleanup() {
	if [ -n "$child_pid" ]; then
		if kill -0 "$child_pid" 2>/dev/null && android_is_owned_child_matching "$child_pid" '*sleep*30*'; then
			kill "$child_pid" 2>/dev/null || true
		fi
		wait "$child_pid" 2>/dev/null || true
	fi
	unlink "$anr_log"
}
trap cleanup EXIT
printf '%s\n' 'E ActivityManager: ANR in com.android.systemui' > "$anr_log"
android_anr_seen "$anr_log"
printf '%s\n' 'E ActivityManager: ANR in com.android.dialer' > "$anr_log"
android_anr_seen "$anr_log"
printf '%s\n' 'E ActivityManager: app started' > "$anr_log"
if android_anr_seen "$anr_log"; then
	echo 'non-ANR ActivityManager event was misclassified as an ANR' >&2
	exit 1
fi

sleep 30 &
child_pid=$!
android_is_owned_child_matching "$child_pid" '*sleep*30*'
if android_is_owned_child_matching "$child_pid" '*adb*logcat*'; then
	echo 'unrelated child unexpectedly matched the adb watcher command' >&2
	exit 1
fi
android_is_owned_child_matching "$child_pid" '*sleep*30*'
kill "$child_pid"
wait "$child_pid" 2>/dev/null || true
child_pid=

if android_window_readiness_focus <<'WINDOWS'
  mCurrentFocus=Window{ab12 u0 com.android.launcher3/.Launcher}
  Window #0 Window{anr u0 Application Not Responding: com.android.systemui}:
    isVisible=true
  Window #1 Window{nav u0 NavigationBar0}:
    isVisible=true
  Window #2 Window{status u0 StatusBar}:
    isVisible=true
WINDOWS
then
	echo 'ANR window unexpectedly passed the readiness check' >&2
	exit 1
fi

if android_window_readiness_focus <<'WINDOWS'
  Window #0 Window{nav u0 NavigationBar0}:
    isVisible=true
  Window #1 Window{status u0 StatusBar}:
    isVisible=true
WINDOWS
then
	echo 'missing focus unexpectedly passed the readiness check' >&2
	exit 1
fi

if android_window_readiness_focus <<'WINDOWS'
  mCurrentFocus=Window{ab12 u0 com.android.launcher3/.Launcher}
  Window #0 Window{nav u0 NavigationBar0}:
    isVisible=true
  Window #1 Window{status u0 StatusBar}:
    isVisible=false
WINDOWS
then
	echo 'hidden system UI unexpectedly passed the readiness check' >&2
	exit 1
fi

echo 'Android window readiness checks passed.'
