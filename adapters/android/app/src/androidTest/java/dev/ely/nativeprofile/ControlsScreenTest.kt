package dev.ely.nativeprofile

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.espresso.Espresso
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Real ViewModel + HTTP + Compose controls against the Go multi-field demo. */
class ControlsScreenTest {
    @get:Rule val compose = createComposeRule()
    @Test fun multipleFieldsAndNativeSelectionsPersistThroughGo() {
        lateinit var focusManager: FocusManager
        compose.setContent {
            focusManager = LocalFocusManager.current
            val model = remember { ProfileViewModel("http://10.0.2.2:8095/native/profile") }
            val state by model.state.collectAsState()
            MaterialTheme { ProfileScreen(state, model::edit, model::save, model::retry, model::reload) }
        }
        compose.waitUntil(timeoutMillis = 90_000) { compose.onAllNodesWithTag("company").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("company").performScrollTo().performClick().performTextReplacement("  Android Controls  ")
        compose.runOnIdle { focusManager.clearFocus(force = true) }
        Espresso.closeSoftKeyboard()
        compose.onNodeWithTag("notifications").performScrollTo().assertIsOff().performClick().assertIsOn()
        compose.onNodeWithTag("digest-consent").performScrollTo().assertIsOff().performClick().assertIsOn()
        compose.onNodeWithTag("color-theme").performScrollTo().performClick()
        compose.onNodeWithTag("color-theme-option-dark").performClick()
        compose.onNodeWithTag("save-profile").performScrollTo().assertIsEnabled().performClick()
        compose.waitUntil(timeoutMillis = 30_000) { compose.onAllNodesWithText("Profile saved.").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("company").performScrollTo().assertTextContains("Android Controls")
        compose.onNodeWithTag("notifications").performScrollTo().assertIsOn()
        compose.onNodeWithTag("digest-consent").performScrollTo().assertIsOn()
        compose.onNodeWithTag("color-theme").performScrollTo().assertTextContains("Dark")
        compose.onNodeWithTag("reload-profile").performScrollTo().performClick()
        compose.onNodeWithText("Discard draft and reload").performClick()
        compose.waitUntil(timeoutMillis = 30_000) { compose.onAllNodesWithText("Edit your display name.").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("company").performScrollTo().assertTextContains("Android Controls")
        compose.onNodeWithTag("notifications").performScrollTo().assertIsOn()
        compose.onNodeWithTag("digest-consent").performScrollTo().assertIsOn()
        compose.onNodeWithTag("color-theme").performScrollTo().assertTextContains("Dark")
    }

    private fun fixture(): Envelope = InstrumentationRegistry.getInstrumentation().context.assets
        .open("profile-controls-ready.json").use { ProfileProtocol.decode(it.readBytes()) }

    @Test fun selectionsRemainEditableDuringSaveAndRetainLaterEdits() {
        val ready = fixture()
        val state = mutableStateOf(ProfileState().beginLoad(ready.requestID).acceptLoad(ready))
        compose.setContent { MaterialTheme {
            ProfileScreen(state.value, { field, value -> state.value = state.value.edit(field, value) },
                { state.value = state.value.beginSave("selection-save") },
                { state.value = state.value.retrySave() }, {})
        } }
        compose.onNodeWithTag("digest-consent").performScrollTo().performClick().assertIsOn()
        compose.onNodeWithTag("color-theme").performScrollTo().performClick()
        compose.onNodeWithTag("color-theme-option-dark").performClick()
        compose.onNodeWithTag("save-profile").performScrollTo().performClick().assertIsNotEnabled()
        val pending = compose.runOnIdle { requireNotNull(state.value.pending) }
        compose.onNodeWithTag("digest-consent").performScrollTo().assertIsEnabled().performClick().assertIsOff()
        compose.onNodeWithTag("color-theme").performScrollTo().assertIsEnabled().performClick()
        compose.onNodeWithTag("color-theme-option-light").performClick()
        compose.runOnIdle { state.value = state.value.networkFailed("selection-save") }
        compose.onNodeWithTag("retry-save").performScrollTo().performClick()
        compose.runOnIdle {
            assertEquals(pending, state.value.pending)
            state.value = state.value.acceptSave(ready.copy(requestID = "selection-save", status = "saved", dataVersion = 1,
                fields = pending.request.fields, acknowledgedEdits = pending.request.editRevisions))
            assertEquals("true", state.value.baseline["digestConsent"])
            assertEquals("dark", state.value.baseline["colorTheme"])
        }
        compose.onNodeWithTag("digest-consent").performScrollTo().assertIsOff()
        compose.onNodeWithTag("color-theme").performScrollTo().assertTextContains("Light")
        compose.onNodeWithTag("save-profile").performScrollTo().assertIsEnabled()
    }

    @Test fun disabledSelectionsCannotChangeDraftsOrOpenDropdown() {
        fun disable(node: Node): Node = node.copy(
            props = if (node.type in setOf("checkbox", "select")) JsonObject(node.props + ("disabled" to JsonPrimitive(true))) else node.props,
            children = node.children.map(::disable))
        val ready = fixture().let { it.copy(region = disable(it.region)) }
        val state = mutableStateOf(ProfileState().beginLoad(ready.requestID).acceptLoad(ready))
        compose.setContent { MaterialTheme {
            ProfileScreen(state.value, { field, value -> state.value = state.value.edit(field, value) }, {}, {}, {})
        } }
        compose.onNodeWithTag("digest-consent").performScrollTo().assertIsNotEnabled().assertIsOff()
        compose.onNodeWithTag("color-theme").performScrollTo().assertIsNotEnabled().assertTextContains("System")
        compose.onNodeWithTag("color-theme-option-dark").assertDoesNotExist()
        compose.runOnIdle { assertEquals(ready.fields, state.value.drafts) }
    }
}
