package dev.ely.nativeprofile

import android.app.Activity
import android.app.UiAutomation
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Observe only: never dismiss a window, request focus, restart, or retry an app action. */
internal class FocusedWindowGate(
    private val activity: Activity,
    private val automation: UiAutomation,
    private val output: () -> File,
    private val boundedOutput: () -> File = output,
) {
    private var stickyAnr: String? = null

    fun await(name: String, timeoutMillis: Long = 10_000) {
        check(Looper.myLooper() != Looper.getMainLooper()) { "Focus wait must not block the main thread" }
        val policy = FocusReadiness(SystemClock.elapsedRealtime(), timeoutMillis)
        val worker = Executors.newSingleThreadExecutor { task -> Thread(task, "focus-observer").apply { isDaemon = true } }
        try {
            while (true) {
                val remaining = policy.remaining(SystemClock.elapsedRealtime())
                if (remaining == 0L) policy.observe(SystemClock.elapsedRealtime(), false, stickyAnr)
                // Binder/accessibility and UI-thread observation share the same wall-clock budget.
                val sample = worker.submit<Pair<Boolean, String?>> {
                    val root = automation.rootInActiveWindow
                    val anr = try { root?.let { findAnr(it) } } finally { root?.recycle() }
                    val done = CountDownLatch(1)
                    var focused = false
                    requireFocusObservationBudget(policy.remaining(SystemClock.elapsedRealtime()), "before posting main-thread probe")
                    Handler(Looper.getMainLooper()).post {
                        focused = activity.hasWindowFocus()
                        done.countDown()
                    }
                    if (!done.await(policy.remaining(SystemClock.elapsedRealtime()), TimeUnit.MILLISECONDS)) {
                        throw FocusObservationBudgetExceeded("after posting main-thread probe")
                    }
                    focused to anr
                }
                val (focused, anr) = try {
                    awaitFocusObservation(sample, remaining, timeoutMillis)
                } finally { sample.cancel(true) }
                if (anr != null) stickyAnr = anr
                if (policy.observe(SystemClock.elapsedRealtime(), focused, stickyAnr)) return
                Thread.sleep(minOf(100L, policy.remaining(SystemClock.elapsedRealtime())))
            }
        } catch (failure: Throwable) {
            runCatching { recordDiagnostics(name, failure) }
                .onFailure { android.util.Log.w("ElyFocusDiagnostics", "Diagnostics failed; original failure retained", it) }
            throw failure
        } finally { worker.shutdownNow() }
    }

    /** Native system ANR windows use android/SystemUI roots; ordinary app prose is not an ANR. */
    private fun findAnr(root: AccessibilityNodeInfo): String? {
        if (root.packageName?.toString() !in setOf("android", "com.android.systemui")) return null
        val texts = mutableListOf<String>()
        fun visit(node: AccessibilityNodeInfo, depth: Int) {
            if (depth > 20 || texts.size >= 100) return
            node.text?.toString()?.let { texts.add(it) }
            for (index in 0 until minOf(node.childCount, 100)) {
                val child = node.getChild(index) ?: continue
                try { visit(child, depth + 1) } finally { child.recycle() }
            }
        }
        visit(root, 0)
        return anrDialogText(root.packageName?.toString(), texts)
    }

    /** Best effort and bounded: diagnostic errors never replace the original assertion. */
    fun recordDiagnostics(name: String, original: Throwable) {
        val worker = Executors.newSingleThreadExecutor { task -> Thread(task, "focus-diagnostics").apply { isDaemon = true } }
        try {
            for ((label, command) in listOf(
                "windows" to "dumpsys window windows",
                "activities" to "dumpsys activity activities",
                "last-anr" to "dumpsys activity lastanr"
            )) {
                val task = worker.submit<String> {
                    ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand(command)).use {
                        val bytes = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(4096)
                        while (bytes.size() < 128 * 1024) {
                            val read = it.read(buffer, 0, minOf(buffer.size, 128 * 1024 - bytes.size()))
                            if (read < 0) break
                            bytes.write(buffer, 0, read)
                        }
                        bytes.toString("UTF-8")
                    }
                }
                try {
                    File(boundedOutput(), "$name-$label.txt").writeText(
                        "elapsedRealtime=${SystemClock.elapsedRealtime()}\noriginal=$original\n" +
                        task.get(2, TimeUnit.SECONDS)
                    )
                } catch (diagnosticFailure: Throwable) {
                    android.util.Log.w("ElyFocusDiagnostics", "$label unavailable; original failure retained", diagnosticFailure)
                } finally { task.cancel(true) }
            }
            runCatching {
                val task = worker.submit<String> {
                    val root = automation.rootInActiveWindow
                    try { "package=${root?.packageName}; class=${root?.className}; text=${root?.text}; anr=${root?.let { findAnr(it) }}" }
                    finally { root?.recycle() }
                }
                try { File(output(), "$name-active-window.txt").writeText(task.get(2, TimeUnit.SECONDS)) }
                finally { task.cancel(true) }
            }.onFailure { android.util.Log.w("ElyFocusDiagnostics", "Active window unavailable; original failure retained", it) }
        } finally { worker.shutdownNow() }
    }
}
