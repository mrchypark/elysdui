package dev.ely.nativeprofile

/** Test-only, monotonic readiness policy. An observed ANR permanently fails this gate. */
internal class FocusReadiness(private val startedAt: Long, private val timeoutMillis: Long) {
    init { require(timeoutMillis > 0) }
    private var observedAnr: String? = null
    fun remaining(now: Long): Long = (timeoutMillis - (now - startedAt)).coerceAtLeast(0)
    fun observe(now: Long, focused: Boolean, anr: String?): Boolean {
        if (anr != null) observedAnr = anr
        observedAnr?.let { throw AssertionError("ANR dialog observed while waiting for window focus: $it") }
        if (remaining(now) == 0L) throw AssertionError("Window focus was not ready within ${timeoutMillis}ms")
        return focused
    }
}

/** System-owned ANR dialogs only; application prose must not trigger this sentinel. */
internal fun anrDialogText(packageName: String?, texts: List<String>): String? {
    if (packageName !in setOf("android", "com.android.systemui")) return null
    return texts.firstOrNull {
        val normalized = it.lowercase().replace('’', '\'')
        normalized.contains("isn't responding") || normalized.contains("is not responding")
    }
}
