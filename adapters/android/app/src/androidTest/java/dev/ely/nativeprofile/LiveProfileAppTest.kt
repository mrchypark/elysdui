package dev.ely.nativeprofile

import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.SystemClock
import android.view.accessibility.AccessibilityWindowInfo
import android.view.inputmethod.InputMethodManager
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.assertTrue

/** Real launcher, ViewModel, HTTP client, native controls, and Go server. No mocked state. */
@RunWith(AndroidJUnit4::class)
class LiveProfileAppTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val instrumentation by lazy { InstrumentationRegistry.getInstrumentation() }
    private val automation by lazy { instrumentation.uiAutomation }
    private val focusedWindow by lazy {
        FocusedWindowGate(compose.activity, automation, ::screenshotDirectory)
    }

    @Test fun realAppLoadsValidatesAndSavesThroughGo() {
        try {
            runLifecycle()
        } catch (failure: Throwable) {
            // Capture before ActivityScenario tears down the failing real app.
            runCatching { focusedWindow.recordDiagnostics("99-failure", failure) }
            runCatching { compose.onRoot(useUnmergedTree = true).printToLog("ElyNativeFailure") }
            runCatching { screenshot("99-failure.png", requireFocusedWindow = false) }
            throw failure
        }
    }

    private fun runLifecycle() {
        // The debug endpoint is the emulator bridge to the host's Go server.
        val directory = screenshotDirectory()
        listOf("01-ready.png", "02-invalid.png", "03-saved.png", "99-failure.png").forEach { File(directory, it).delete() }
        // A cold hosted emulator can spend tens of seconds verifying Compose classes.
        // Real transport/protocol failures still fail immediately instead of retrying.
        awaitPhase("initial profile load", timeoutMillis = 90_000) {
            compose.onAllNodesWithTag("display-name").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("request-status").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("display-name").assertIsEnabled().assertIsDisplayed()
        compose.onNodeWithTag("save-profile").assertIsEnabled().assertIsDisplayed()
        screenshot("01-ready.png")

        compose.onNodeWithTag("display-name").performScrollTo().performClick().performTextClearance()
        closeKeyboard(expectedEditableText = "")
        compose.onNodeWithTag("save-profile").performScrollTo().assertIsDisplayed().performClick()
        val validation = "Use 2 to 60 characters for your display name."
        awaitPhase("server validation") {
            compose.onAllNodesWithText(validation).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("request-status").performScrollTo().assertIsDisplayed().assertTextEquals("No changes saved.")
        compose.onNodeWithText(validation).assertIsDisplayed()
        compose.onNodeWithTag("display-name").assertIsDisplayed()
        compose.onNodeWithTag("save-profile").assertIsDisplayed()
        screenshot("02-invalid.png")

        compose.onNodeWithTag("display-name").performClick().performTextReplacement("  Android Emulator  ")
        closeKeyboard(expectedEditableText = "  Android Emulator  ")
        compose.onNodeWithText(validation).assertDoesNotExist()
        compose.onNodeWithTag("save-profile").performScrollTo().assertIsDisplayed().performClick()
        awaitPhase("canonical save") {
            compose.onAllNodesWithText("Profile saved.").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("request-status").performScrollTo().assertIsDisplayed().assertTextEquals("Profile saved.")
        // Canonicalization proves a server reply was adopted by the actual app.
        compose.onNodeWithTag("display-name").assertTextContains("Android Emulator")
        compose.onNodeWithTag("display-name").assert(SemanticsMatcher.expectValue(
            SemanticsProperties.EditableText, AnnotatedString("Android Emulator")))
        compose.onNodeWithTag("display-name").assertIsDisplayed()
        compose.onNodeWithTag("save-profile").assertIsEnabled().assertIsDisplayed()
        screenshot("03-saved.png")
    }

    private fun awaitPhase(phase: String, timeoutMillis: Long = 30_000, condition: () -> Boolean) {
        try {
            compose.waitUntil(timeoutMillis = timeoutMillis) {
                val unavailable = compose.onAllNodesWithText("Profile unavailable").fetchSemanticsNodes().isNotEmpty()
                val retry = compose.onAllNodesWithTag("retry-save").fetchSemanticsNodes().isNotEmpty()
                check(!unavailable && !retry) {
                    "$phase failed in the real app:\n${compose.onRoot(useUnmergedTree = true).printToString()}"
                }
                condition()
            }
        } catch (failure: Throwable) {
            throw AssertionError("Did not complete $phase. ${failure.message}", failure)
        }
    }

    private fun closeKeyboard(expectedEditableText: String) {
        val activity = compose.activity
        val serviceInfo = requireNotNull(automation.serviceInfo) {
            "Cannot determine whether the IME is visible: UiAutomation service info is unavailable"
        }
        val originalFlags = serviceInfo.flags
        val retrieveWindows = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        try {
            if ((originalFlags and retrieveWindows) == 0) {
                serviceInfo.flags = originalFlags or retrieveWindows
                automation.setServiceInfo(serviceInfo)
            }

            val activityBounds = Rect()
            var activityWindowId = -1
            instrumentation.runOnMainSync {
                val decorView = activity.window.decorView
                val focusedView = activity.currentFocus ?: decorView
                val windowToken = requireNotNull(focusedView.windowToken) {
                    "Cannot request IME dismissal without the Activity window token"
                }
                assertTrue("Activity window has no visible bounds", decorView.getGlobalVisibleRect(activityBounds))
                val decorNode = decorView.createAccessibilityNodeInfo()
                try {
                    activityWindowId = decorNode.windowId
                } finally {
                    decorNode.recycle()
                }
                check(activityWindowId >= 0) { "Cannot identify this Activity's accessibility window" }
                val inputMethodManager = requireNotNull(
                    activity.getSystemService(InputMethodManager::class.java)
                ) { "InputMethodManager is unavailable" }
                // Request hide directly; its return value does not report actual IME visibility.
                inputMethodManager.hideSoftInputFromWindow(windowToken, 0)
            }

            val deadline = SystemClock.elapsedRealtime() + 3_000L
            var sawOwnActivityWindow = false
            var imeHiddenWithOwnWindow = false
            var settledSince = 0L
            while (SystemClock.elapsedRealtime() < deadline) {
                val windows = automation.windows
                val imeVisible: Boolean
                val ownActivityWindow: Boolean
                try {
                    imeVisible = windows.any { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD }
                    ownActivityWindow = windows.any {
                        isOwnActivityWindow(it, activity, activityBounds, activityWindowId)
                    }
                } finally {
                    windows.forEach { it.recycle() }
                }
                sawOwnActivityWindow = sawOwnActivityWindow || ownActivityWindow
                if (ownActivityWindow && !imeVisible) {
                    val now = SystemClock.elapsedRealtime()
                    if (settledSince == 0L) settledSince = now
                    if (now - settledSince >= 500L) {
                        imeHiddenWithOwnWindow = true
                        break
                    }
                } else {
                    settledSince = 0L
                }
                SystemClock.sleep(50L)
            }
            assertTrue("Could not observe this Activity's application window", sawOwnActivityWindow)
            assertTrue("IME was not observed hidden alongside this Activity window", imeHiddenWithOwnWindow)
        } finally {
            if (serviceInfo.flags != originalFlags) {
                serviceInfo.flags = originalFlags
                automation.setServiceInfo(serviceInfo)
            }
        }

        assertTrue("Activity is finishing after IME dismissal", !activity.isFinishing)
        assertTrue("Activity is destroyed after IME dismissal", !activity.isDestroyed)
        compose.onNodeWithTag("display-name")
            .assertIsFocused()
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText, AnnotatedString(expectedEditableText)))
    }

    private fun isOwnActivityWindow(
        window: AccessibilityWindowInfo,
        activity: MainActivity,
        activityBounds: Rect,
        activityWindowId: Int,
    ): Boolean {
        if (window.type != AccessibilityWindowInfo.TYPE_APPLICATION || window.id != activityWindowId) return false
        val root = window.root ?: return false
        return try {
            if (root.packageName?.toString() != activity.packageName) return false
            val rootBounds = Rect().also(root::getBoundsInScreen)
            !rootBounds.isEmpty && Rect.intersects(activityBounds, rootBounds)
        } finally {
            root.recycle()
        }
    }

    private fun screenshotDirectory(): File {
        // Gradle UTP pulls this directory before uninstalling the app. A later adb
        // pull from external app files alone can lose screenshots during teardown.
        val additionalOutput = InstrumentationRegistry.getArguments().getString("additionalTestOutputDir")
        val root = if (!additionalOutput.isNullOrBlank()) File(additionalOutput) else {
            val target = InstrumentationRegistry.getInstrumentation().targetContext
            requireNotNull(target.getExternalFilesDir(null)) { "Emulator external app files are unavailable" }
        }
        val directory = File(root, "screenshots")
        assertTrue("Cannot create screenshot output directory", directory.isDirectory || directory.mkdirs())
        return directory
    }

    private fun screenshot(name: String, requireFocusedWindow: Boolean = true) {
        compose.waitForIdle()
        if (requireFocusedWindow) {
            focusedWindow.await(name)
            val activity = compose.activity
            compose.runOnIdle {
                assertTrue("Cannot capture a successful state while another window obscures the app", activity.hasWindowFocus())
            }
        }
        val image = requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()) {
            "The emulator did not return a screenshot"
        }
        try {
            val output = File(screenshotDirectory(), name)
            output.outputStream().use {
                assertTrue("Could not encode screenshot", image.compress(Bitmap.CompressFormat.PNG, 100, it))
            }
            android.util.Log.i("ElyNativeScreenshot", "Saved ${output.absolutePath}")
        } finally { image.recycle() }
    }
}
