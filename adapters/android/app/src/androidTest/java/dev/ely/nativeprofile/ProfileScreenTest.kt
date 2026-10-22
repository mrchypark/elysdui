package dev.ely.nativeprofile

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.espresso.Espresso
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ProfileScreenTest {
    @get:Rule val compose = createComposeRule()
    private fun ready(): Envelope = InstrumentationRegistry.getInstrumentation().context.assets
        .open("profile-ready.json").use { ProfileProtocol.decode(it.readBytes()) }
    private fun findInput(node: Node): Node? = if (node.type == "input") node else node.children.firstNotNullOfOrNull(::findInput)
    private fun findButton(node: Node): Node? = if (node.type == "button") node else node.children.firstNotNullOfOrNull(::findButton)

    @Test fun nativeFieldRetainsNewEditsAndFocusAfterFullRegionSave() {
        val ready = ready()
        val state = mutableStateOf(ProfileState().beginLoad(ready.requestID).acceptLoad(ready))
        lateinit var focusManager: FocusManager
        compose.setContent {
            MaterialTheme {
                focusManager = LocalFocusManager.current
                ProfileScreen(state.value, { field, text -> state.value = state.value.edit(field, text) },
                    { state.value = state.value.beginSave("save-1") }, {}, {})
            }
        }
        val inputID = findInput(ready.region)!!.id
        val buttonID = findButton(ready.region)!!.id
        compose.onNodeWithTag(inputID).performScrollTo().performClick().performTextReplacement("Alice")
        finishComposition(focusManager)
        awaitSaveReady("initial save", inputID, buttonID, "Alice") { state.value }
        compose.onNodeWithTag(buttonID).performScrollTo().assertIsEnabled().performClick()
        val pending = compose.runOnIdle {
            requireNotNull(state.value.pending) { "The enabled Save button must start a request" }.request.also {
                assertEquals("save-1", it.requestID)
                assertEquals(mapOf("displayName" to "Alice"), it.fields)
            }
        }
        compose.onNodeWithTag(buttonID).assertIsNotEnabled()
        compose.onNodeWithTag(inputID).performScrollTo().performClick().performTextReplacement("Alice Cooper")
        compose.onNodeWithTag(inputID).assertTextContains("Alice Cooper").assertIsFocused()
        compose.runOnIdle {
            assertEquals("Alice Cooper", state.value.drafts["displayName"])
            assertEquals(pending, state.value.pending?.request)
            state.value = state.value.acceptSave(ready.copy(requestID = pending.requestID, status = "saved", dataVersion = ready.dataVersion + 1,
                fields = mapOf("displayName" to "Alice"), acknowledgedEdits = pending.editRevisions))
        }
        compose.onNodeWithTag(inputID).assertTextContains("Alice Cooper").assertIsFocused()
        compose.runOnIdle {
            assertEquals(null, state.value.pending)
            assertEquals("Alice", state.value.baseline["displayName"])
            assertEquals("Alice Cooper", state.value.drafts["displayName"])
        }
        // The late edit may still be composing: completion clears pending, but
        // Save becomes enabled only after the user ends that composition.
        finishComposition(focusManager)
        awaitSaveReady("save after late edit", inputID, buttonID, "Alice Cooper") { state.value }
        compose.onNodeWithTag(buttonID).assertIsEnabled()
    }

    @Test fun nativeValidationClearsAfterUserCorrectsField() {
        val ready = ready()
        val state = mutableStateOf(ProfileState().beginLoad(ready.requestID).acceptLoad(ready))
        lateinit var focusManager: FocusManager
        compose.setContent {
            MaterialTheme {
                focusManager = LocalFocusManager.current
                ProfileScreen(state.value, { field, text -> state.value = state.value.edit(field, text) },
                    { state.value = state.value.beginSave("save-1") }, {}, {})
            }
        }
        val inputID = findInput(ready.region)!!.id
        val buttonID = findButton(ready.region)!!.id
        compose.onNodeWithTag(inputID).performScrollTo().performClick().performTextClearance()
        finishComposition(focusManager)
        awaitSaveReady("empty-field validation save", inputID, buttonID, "") { state.value }
        compose.onNodeWithTag(buttonID).performScrollTo().assertIsEnabled().performClick()
        compose.runOnIdle {
            val pending = requireNotNull(state.value.pending) { "The enabled Save button must start a request" }.request
            assertEquals("save-1", pending.requestID)
            assertEquals(mapOf("displayName" to ""), pending.fields)
            state.value = state.value.acceptSave(ready.copy(requestID = pending.requestID, status = "invalid",
                acknowledgedEdits = pending.editRevisions, errors = mapOf("displayName" to "Enter a display name.")))
        }
        compose.onNodeWithText("Enter a display name.").assertExists()
        compose.onNodeWithTag(inputID).performScrollTo().performClick().performTextReplacement("Ada")
        compose.onNodeWithText("Enter a display name.").assertDoesNotExist()
    }

    private fun finishComposition(focusManager: FocusManager) {
        // Android IMEs may keep composition after keyboard dismissal. Move native
        // input focus out of the field so CoreTextField runs its normal onBlur path.
        // This test harness uses the real focus manager, not a synthetic text edit.
        compose.runOnIdle { focusManager.clearFocus(force = true) }
        Espresso.closeSoftKeyboard()
        compose.waitForIdle()
    }

    private fun awaitSaveReady(
        phase: String,
        inputID: String,
        buttonID: String,
        expectedText: String,
        state: () -> ProfileState,
    ) {
        // Observe committed UI state after native focus/IME completion. Do not
        // resend edits, click Save, or bypass the renderer's composition guard.
        val expectedInput = hasTestTag(inputID) and SemanticsMatcher.expectValue(
            SemanticsProperties.EditableText, AnnotatedString(expectedText))
        try {
            compose.waitUntil(timeoutMillis = 5_000) {
                compose.onAllNodes(expectedInput).fetchSemanticsNodes().size == 1 &&
                    compose.onAllNodes(hasTestTag(buttonID) and isEnabled()).fetchSemanticsNodes().size == 1
            }
        } catch (failure: Throwable) {
            // Fixture-only diagnostics: never log the protocol envelope or its
            // session/CSRF tokens, and never expose production test-only APIs.
            val stateDetails = runCatching {
                compose.runOnIdle {
                    val snapshot = state()
                    "screenPresent=${snapshot.screen != null}, canSave=${snapshot.canSave}, " +
                        "pending=${snapshot.pending != null}, inFlight=${snapshot.pending?.inFlight}, " +
                        "loading=${snapshot.loadingID != null}, hardError=${snapshot.hardError}, " +
                        "drafts=${snapshot.drafts}, baseline=${snapshot.baseline}, editRevisions=${snapshot.editRevisions}"
                }
            }.getOrElse { "State diagnostics unavailable: ${it.message}" }
            val compositionHint = runCatching {
                compose.onAllNodesWithText("Finish composing text before saving.").fetchSemanticsNodes().isNotEmpty()
            }.getOrNull()
            val tree = runCatching { compose.onRoot(useUnmergedTree = true).printToString() }
                .getOrElse { "Semantics diagnostics unavailable: ${it.message}" }
            throw AssertionError(
                "Save readiness timed out during $phase; input=$inputID, button=$buttonID, " +
                    "expectedText=$expectedText, compositionHintVisible=$compositionHint; $stateDetails\n$tree",
                failure)
        }
    }
}
