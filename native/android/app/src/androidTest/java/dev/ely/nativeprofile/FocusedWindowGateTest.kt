package dev.ely.nativeprofile

import android.app.Dialog
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Real focus-stealing native windows; these fixtures never touch system dialogs. */
@RunWith(AndroidJUnit4::class)
class FocusedWindowGateTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private fun gate() = FocusedWindowGate(compose.activity, instrumentation.uiAutomation) {
        File(instrumentation.targetContext.cacheDir, "focus-counterexamples").apply { mkdirs() }
    }
    private fun showTestDialog(): Dialog {
        lateinit var dialog: Dialog
        val activity = compose.activity
        instrumentation.runOnMainSync {
            dialog = Dialog(activity).apply {
                setTitle("Test-owned focus counterexample")
                setContentView(TextView(context).apply { text = "This window must prevent a successful app capture." })
                show()
            }
        }
        compose.waitUntil(timeoutMillis = 5_000) {
            var focused = true
            instrumentation.runOnMainSync { focused = activity.hasWindowFocus() }
            !focused
        }
        return dialog
    }
    @Test fun persistentTestDialogCannotBeAcceptedAsReady() {
        compose.setContent { Text("Foreground test app") }
        gate().await("baseline")
        val dialog = showTestDialog()
        try {
            var rejected = false
            try { gate().await("persistent-dialog", timeoutMillis = 350) }
            catch (expected: AssertionError) {
                assertTrue(expected.message.orEmpty().contains("Window focus"))
                rejected = true
            }
            assertTrue("A focus-stealing dialog must fail readiness", rejected)
            instrumentation.runOnMainSync { assertTrue("The gate must not dismiss windows", dialog.isShowing) }
        } finally {
            // Test fixture cleanup only, after its expected failure has been verified.
            instrumentation.runOnMainSync { dialog.dismiss() }
        }
    }
    @Test fun transientTestDialogCanRecoverWithinBound() {
        compose.setContent { Text("Foreground test app") }
        gate().await("baseline")
        val dialog = showTestDialog()
        try {
            // Simulate an asynchronous fixture transition, not a production recovery action.
            Handler(Looper.getMainLooper()).postDelayed({ dialog.dismiss() }, 500)
            gate().await("transient-dialog")
            val activity = compose.activity
            instrumentation.runOnMainSync { assertTrue(activity.hasWindowFocus()) }
        } finally { instrumentation.runOnMainSync { dialog.dismiss() } }
    }
}
