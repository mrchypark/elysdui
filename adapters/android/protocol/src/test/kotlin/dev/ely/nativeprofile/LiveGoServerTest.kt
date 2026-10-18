package dev.ely.nativeprofile

import org.junit.Assume.assumeTrue
import kotlin.test.*

/** Opt-in interoperability test against the actual Go demo, not a mock. */
class LiveGoServerTest {
    @Test fun `Go load validation save retry and cookie-backed reload`() {
        val base = System.getenv("ELY_NATIVE_TEST_BASE_URL")
        assumeTrue("Set ELY_NATIVE_TEST_BASE_URL to run the real Go interoperability test", !base.isNullOrBlank())
        val endpoint = if (base!!.endsWith("/native/profile")) base else base.trimEnd('/') + "/native/profile"
        val client = ProfileHttpClient(endpoint, allowDemoHttp = true)
        val loadID = ProfileProtocol.newRequestID()
        val ready = client.load(loadID)
        var state = ProfileState().beginLoad(loadID).completeLoad(loadID, ready)
        assertEquals("ready", state.screen!!.status)
        val session = ready.sessionID

        state = state.edit("displayName", "").beginSave()
        val invalidPending = state.pending!!
        val invalid = client.save(invalidPending)
        assertEquals("invalid", invalid.status)
        state = state.completeSave(invalidPending.request.requestID, invalid)
        assertTrue(state.errors.containsKey("displayName"))
        assertEquals("", state.drafts["displayName"])

        state = state.edit("displayName", "  Android Native  ").beginSave()
        val savePending = state.pending!!
        // Typing while the request is pending must survive the canonical save.
        state = state.edit("displayName", "Newer local draft")
        val saved = client.save(savePending)
        assertEquals("saved", saved.status)
        assertEquals("Android Native", saved.fields["displayName"])
        state = state.completeSave(savePending.request.requestID, saved)
        assertEquals("Newer local draft", state.drafts["displayName"])
        assertEquals("Android Native", state.baseline["displayName"])
        val replay = client.save(savePending)
        assertEquals(saved, replay)

        val reload = client.load(ProfileProtocol.newRequestID())
        assertEquals(session, reload.sessionID)
        assertEquals("Android Native", reload.fields["displayName"])
        assertEquals(saved.dataVersion, reload.dataVersion)
    }
}
