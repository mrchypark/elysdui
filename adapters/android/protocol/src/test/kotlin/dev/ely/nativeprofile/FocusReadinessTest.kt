package dev.ely.nativeprofile

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertFailsWith

class FocusReadinessTest {
    @Test fun transientFocusLossRecoversBeforeDeadline() {
        val gate = FocusReadiness(100, 10_000)
        assertFalse(gate.observe(100, false, null))
        assertFalse(gate.observe(1_000, false, null))
        assertTrue(gate.observe(2_000, true, null))
    }
    @Test fun persistentFocusLossAndLateFocusFail() {
        val gate = FocusReadiness(100, 10_000)
        assertFalse(gate.observe(10_099, false, null))
        assertFailsWith<AssertionError> { gate.observe(10_100, false, null) }
        assertFailsWith<AssertionError> { gate.observe(10_101, true, null) }
    }
    @Test fun anrRemainsFailureAfterFocusReturnsOrDialogDisappears() {
        val gate = FocusReadiness(0, 10_000)
        assertFailsWith<AssertionError> { gate.observe(1, false, anrDialogText("com.android.systemui", listOf("System UI isn't responding"))) }
        assertFailsWith<AssertionError> { gate.observe(2, true, null) }
    }
    @Test fun systemAndAppAnrDialogsAreRecognizedWithoutMatchingAppProse() {
        assertEquals("Example isn't responding", anrDialogText("android", listOf("Example isn't responding", "Close app", "Wait")))
        assertEquals("System UI isn’t responding", anrDialogText("com.android.systemui", listOf("System UI isn’t responding")))
        assertNull(anrDialogText("dev.ely.nativeprofile", listOf("Example isn't responding")))
        assertNull(anrDialogText("android", listOf("Permission required")))
    }
    @Test fun focusedWindowDoesNotOverrideAnr() {
        assertFailsWith<AssertionError> {
            FocusReadiness(0, 10_000).observe(1, true, "App isn't responding")
        }
    }
}
