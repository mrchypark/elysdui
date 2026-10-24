#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
source "$ROOT/scripts/ci/native/android-readiness.sh"

healthy=$(android_window_readiness_identity <<'WINDOWS'
  mCurrentFocus=Window{ab12 u0 com.android.launcher3/.Launcher}
  Window #0 Window{nav u0 NavigationBar0}:
    isVisible=true
  Window #1 Window{status u0 StatusBar}:
    isVisible=true
WINDOWS
)
[[ "$healthy" == 'Window{ab12 u0 com.android.launcher3/.Launcher}' ]]

if ! android_kvm_accel_check_usable <<'ACCEL'
accel:
0
KVM (version 12) is installed and usable.
ACCEL
then
	echo 'usable KVM acceleration report was rejected' >&2
	exit 1
fi
if android_kvm_accel_check_usable <<'ACCEL'
accel:
1
KVM is not installed or usable.
ACCEL
then
	echo 'unusable KVM acceleration report was accepted' >&2
	exit 1
fi
[[ "$(android_cpuinfo_processor_count <<'CPUINFO'
processor : 0
vendor_id : GenuineIntel

processor : 1
vendor_id : GenuineIntel
CPUINFO
)" == 2 ]]
[[ "$(android_cpuinfo_processor_count <<'CPUINFO'
processor : 0
vendor_id : GenuineIntel
CPUINFO
)" == 1 ]]

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

if android_window_readiness_identity <<'WINDOWS'
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

if android_window_readiness_identity <<'WINDOWS'
  Window #0 Window{nav u0 NavigationBar0}:
    isVisible=true
  Window #1 Window{status u0 StatusBar}:
    isVisible=true
WINDOWS
then
	echo 'missing focus unexpectedly passed the readiness check' >&2
	exit 1
fi

if android_window_readiness_identity <<'WINDOWS'
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

api29_dump=$(cat <<'WINDOWS'
WINDOW MANAGER WINDOWS (dumpsys window windows)
  Window #0 Window{a83c8d1 u0 NavigationBar0}:
    mDisplayId=0
    mAttrs={(0,0)(fillxfill) sim={adjust=pan} ty=NAVIGATION_BAR fmt=TRANSLUCENT
      fl=NOT_FOCUSABLE NOT_TOUCH_MODAL TOUCHABLE_WHEN_WAKING WATCH_OUTSIDE_TOUCH SPLIT_TOUCH HARDWARE_ACCELERATED FLAG_SLIPPERY
    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false
    isOnScreen=true
    isVisible=true
  Window #1 Window{a378841 u0 StatusBar}:
    mDisplayId=0
    mAttrs={(0,0)(fillx36) gr=TOP CENTER_VERTICAL sim={adjust=resize} layoutInDisplayCutoutMode=always ty=STATUS_BAR fmt=TRANSLUCENT
      fl=NOT_FOCUSABLE TOUCHABLE_WHEN_WAKING WATCH_OUTSIDE_TOUCH SPLIT_TOUCH HARDWARE_ACCELERATED DRAWS_SYSTEM_BAR_BACKGROUNDS
    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false
    isOnScreen=true
    isVisible=true
  Window #2 Window{7f335bd u0 AssistPreviewPanel}:
    mDisplayId=0
    mAttrs={(0,0)(fillx375) gr=BOTTOM START CENTER sim={state=unchanged adjust=nothing} ty=VOICE_INTERACTION_STARTING fmt=TRANSLUCENT
      fl=NOT_FOCUSABLE NOT_TOUCHABLE LAYOUT_IN_SCREEN HARDWARE_ACCELERATED
    mHasSurface=false isReadyForDisplay()=false mWindowRemovalAllowed=false
    isOnScreen=false
    isVisible=false
  Window #3 Window{be83e6e u0 DockedStackDivider}:
    mDisplayId=0
    mAttrs={(0,0)(fillx72) sim={adjust=pan} layoutInDisplayCutoutMode=always ty=DOCK_DIVIDER fmt=TRANSLUCENT
      fl=NOT_FOCUSABLE NOT_TOUCH_MODAL WATCH_OUTSIDE_TOUCH SPLIT_TOUCH HARDWARE_ACCELERATED FLAG_SLIPPERY
    mHasSurface=false isReadyForDisplay()=false mWindowRemovalAllowed=false
    isOnScreen=false
    isVisible=false
  Window #4 Window{f2f7031 u0 com.android.launcher3/com.android.launcher3.Launcher}:
    mDisplayId=0
    mAttrs={(0,0)(fillxfill) sim={adjust=pan forwardNavigation} layoutInDisplayCutoutMode=always ty=BASE_APPLICATION fmt=TRANSPARENT wanim=0x10302f1
      fl=LAYOUT_IN_SCREEN LAYOUT_INSET_DECOR SHOW_WALLPAPER SPLIT_TOUCH HARDWARE_ACCELERATED DRAWS_SYSTEM_BAR_BACKGROUNDS
    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false
    isOnScreen=true
    isVisible=true
  Window #5 Window{7fe3834 u0 com.android.systemui.ImageWallpaper}:
    mDisplayId=0
    mAttrs={(0,0)(1553x1280) gr=TOP START CENTER layoutInDisplayCutoutMode=always ty=WALLPAPER fmt=RGBX_8888 wanim=0x103030e
      fl=NOT_FOCUSABLE NOT_TOUCHABLE LAYOUT_IN_SCREEN LAYOUT_NO_LIMITS SCALED LAYOUT_INSET_DECOR
    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false
    isOnScreen=true
    isVisible=true
  mTopFocusedDisplayId=0
WINDOWS
)
api29_identity=$(android_window_readiness_identity <<< "$api29_dump")
[[ "$api29_identity" == 'Window{f2f7031 u0 com.android.launcher3/com.android.launcher3.Launcher}' ]]

if android_window_readiness_identity <<< "${api29_dump}
  Window #6 Window{second u0 com.example.Second}:
    mDisplayId=0
    mAttrs={(0,0)(fillxfill) ty=BASE_APPLICATION
      fl=LAYOUT_IN_SCREEN
    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false
    isOnScreen=true
    isVisible=true"; then
	echo 'ambiguous API 29 window identity unexpectedly passed' >&2
	exit 1
fi

if android_window_readiness_identity <<< "  mCurrentFocus=null
${api29_dump}"; then
	echo 'explicitly null current focus unexpectedly fell back to a window candidate' >&2
	exit 1
fi

echo 'Android window readiness checks passed.'
