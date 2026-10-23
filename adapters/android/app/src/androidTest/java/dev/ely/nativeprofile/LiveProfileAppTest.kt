package dev.ely.nativeprofile

import android.graphics.Bitmap
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.SystemClock
import android.view.KeyEvent
import android.view.accessibility.AccessibilityWindowInfo
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

            val imeWasVisible = hasInputMethodWindow()
            if (imeWasVisible) {
                // A single trusted native Back dismisses the IME without invoking IME Done/save.
                instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
                val deadline = SystemClock.elapsedRealtime() + 3_000L
                var imeHidden = false
                while (SystemClock.elapsedRealtime() < deadline) {
                    if (!hasInputMethodWindow()) {
                        imeHidden = true
                        break
                    }
                    SystemClock.sleep(50L)
                }
                assertTrue("IME remained visible after one native Back", imeHidden)
            }
        } finally {
            if (serviceInfo.flags != originalFlags) {
                serviceInfo.flags = originalFlags
                automation.setServiceInfo(serviceInfo)
            }
        }

        val activity = compose.activity
        assertTrue("Activity is finishing after IME dismissal", !activity.isFinishing)
        assertTrue("Activity is destroyed after IME dismissal", !activity.isDestroyed)
        compose.onNodeWithTag("display-name")
            .assertIsFocused()
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText, AnnotatedString(expectedEditableText)))
    }

    private fun hasInputMethodWindow(): Boolean {
        val windows = automation.windows
        return try {
            windows.any { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD }
        } finally {
            windows.forEach { it.recycle() }
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
