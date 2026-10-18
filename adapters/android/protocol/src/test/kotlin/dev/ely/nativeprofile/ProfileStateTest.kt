package dev.ely.nativeprofile

import kotlinx.serialization.json.*
import java.io.File
import kotlin.test.*

internal fun sampleJSON(): String = """
{"protocolVersion":"1","screenID":"profile","screenRevision":"definition-1","sessionID":"session-1","requestID":"load-1","dataVersion":0,"status":"ready","csrfToken":"csrf-1","requiredCapabilities":["region","form","stack","text","input","button","notice"],"region":{"id":"profile-region","type":"region","props":{"label":"Profile"},"children":[{"id":"profile-form","type":"form","props":{"label":"Edit profile"},"events":[{"on":"submit","action":"save-profile","target":"profile-region"}],"children":[{"id":"display-name","type":"input","props":{"name":"displayName","label":"Display name","type":"text"}},{"id":"save-profile","type":"button","props":{"label":"Save profile","type":"submit"}}]}]},"fields":{"displayName":"Ada"},"acknowledgedEdits":{},"errors":{},"message":"Edit your display name."}
""".trimIndent()
internal fun sample(): Envelope = ProfileProtocol.decode(sampleJSON().toByteArray())
internal fun loaded(): ProfileState = ProfileState().beginLoad("load-1").acceptLoad(sample())
internal fun response(state: ProfileState, status: String = "saved", canonical: String = "Alice"): Envelope {
    val request = state.pending!!.request
    return sample().copy(requestID = request.requestID, dataVersion = if (status == "saved") 1 else 0,
        status = status, fields = mapOf("displayName" to canonical), acknowledgedEdits = request.editRevisions)
}

class ProfileStateTest {
    @Test fun `initial response initializes separate baseline and draft`() {
        val s = loaded().edit("displayName", "Alice")
        assertEquals("Ada", s.baseline["displayName"])
        assertEquals("Alice", s.drafts["displayName"])
        assertEquals(1L, s.editRevisions["displayName"])
    }
    @Test fun `save adopts canonical value when edit revision is unchanged`() {
        val s = loaded().edit("displayName", " Alice ").beginSave("save-1")
        val result = s.acceptSave(response(s))
        assertEquals("Alice", result.drafts["displayName"])
        assertFalse(result.dirty)
        assertNull(result.pending)
    }
    @Test fun `typing during save survives full region replacement`() {
        val pending = loaded().edit("displayName", "Alice").beginSave("save-1")
        val s = pending.edit("displayName", "Alice Cooper").acceptSave(response(pending))
        assertEquals("Alice", s.baseline["displayName"])
        assertEquals("Alice Cooper", s.drafts["displayName"])
        assertEquals(2L, s.editRevisions["displayName"])
        assertTrue(s.canSave)
    }
    @Test fun `retry reuses exact bytes request ID token and captured values`() {
        val first = loaded().edit("displayName", "Alice").beginSave("save-1")
        val failure = first.networkFailed("save-1").edit("displayName", "Later")
        val retry = failure.retrySave()
        assertEquals(first.pending, retry.pending)
        assertEquals("Later", retry.drafts["displayName"])
        assertEquals("Alice", retry.pending!!.request.fields["displayName"])
        assertFalse(retry.canSave)
        assertEquals(retry, retry.beginSave("must-not-send"))
    }
    @Test fun `validation errors apply only to still-current submitted edits`() {
        val s = loaded().edit("displayName", "").beginSave("save-1")
        val invalid = response(s, "invalid", "Ada").copy(errors = mapOf("displayName" to "Enter a display name."))
        assertEquals("Enter a display name.", s.acceptSave(invalid).errors["displayName"])
        val later = s.edit("displayName", "Fixed").acceptSave(invalid)
        assertTrue(later.errors.isEmpty())
        assertEquals("Fixed", later.drafts["displayName"])
        assertEquals("Ada", later.baseline["displayName"])
    }
    @Test fun `later edits clear shown validation error`() {
        val s = loaded().beginSave("save-1")
        val invalid = s.acceptSave(response(s, "invalid").copy(errors = mapOf("displayName" to "Invalid")))
        assertTrue(invalid.edit("displayName", "Fixed").errors.isEmpty())
    }
    @Test fun `conflict preserves drafts and advances authoritative revision for next explicit save`() {
        val s = loaded().edit("displayName", "Mine").beginSave("save-1")
        val conflict = response(s, "conflict", "Other").copy(screenRevision = "definition-2", dataVersion = 4, message = "Review and save again.")
        val result = s.acceptSave(conflict)
        assertEquals("Mine", result.drafts["displayName"])
        assertEquals("Other", result.baseline["displayName"])
        assertEquals("definition-2", result.beginSave("save-2").pending!!.request.screenRevision)
        assertEquals(4L, result.beginSave("save-2").pending!!.request.dataVersion)
    }
    @Test fun `wrong ID session screen old version and duplicate replies cannot replace state`() {
        val s = loaded().edit("displayName", "Alice").beginSave("save-1")
        val reply = response(s)
        assertEquals(s, s.acceptSave(reply.copy(requestID = "old-request")))
        assertEquals(s, s.acceptSave(reply.copy(sessionID = "other-session")))
        assertEquals(s, s.acceptSave(reply.copy(screenID = "other-screen")))
        val advanced = s.copy(screen = s.screen!!.copy(dataVersion = 2))
        assertEquals(advanced, advanced.acceptSave(reply))
        val accepted = s.acceptSave(reply)
        assertEquals(accepted, accepted.acceptSave(reply))
    }
    @Test fun `same-version saved response is a hard failure and preserves draft`() {
        val s = loaded().edit("displayName", "Mine").beginSave("save-1")
        val result = s.acceptSave(response(s).copy(dataVersion = 0))
        assertNotNull(result.hardError)
        assertEquals("Mine", result.drafts["displayName"])
    }
    @Test fun `wrong acknowledgement is hard failure and cannot clobber drafts`() {
        val s = loaded().edit("displayName", "Mine").beginSave("save-1")
        val result = s.acceptSave(response(s).copy(acknowledgedEdits = mapOf("displayName" to 99)))
        assertNotNull(result.hardError)
        assertEquals(s.drafts, result.drafts)
        assertEquals(s.screen, result.screen)
    }
    @Test fun `explicit reload supersedes earlier requests and stale completions`() {
        val pending = loaded().beginSave("save-1")
        val reloading = pending.beginLoad("load-2")
        assertEquals(reloading, reloading.acceptSave(response(pending)))
        assertEquals(reloading, reloading.networkFailed("save-1"))
        assertEquals(reloading, reloading.acceptLoad(sample()))
        val loaded = reloading.acceptLoad(sample().copy(requestID = "load-2"))
        assertNull(loaded.loadingID)
        assertEquals("Ada", loaded.drafts["displayName"])
    }
    @Test fun `load cannot roll same session backward or acknowledge edits`() {
        val reloading = loaded().copy(screen = sample().copy(dataVersion = 3)).beginLoad("load-2")
        assertEquals(reloading, reloading.acceptLoad(sample().copy(requestID = "load-2")))
        assertNotNull(reloading.acceptLoad(sample().copy(requestID = "load-2", acknowledgedEdits = mapOf("displayName" to 0))).hardError)
    }
    @Test fun `ignored current completion enables retry without applying reply`() {
        val s = loaded().beginSave("save-1")
        val next = s.completeSave("save-1", response(s).copy(requestID = "wrong-echo"))
        assertEquals(s.screen, next.screen)
        assertEquals(s.pending!!.body, next.pending!!.body)
        assertFalse(next.pending!!.inFlight)
        assertNotNull(next.retryMessage)
        assertEquals(s, s.completeSave("obsolete-call", response(s)))
        val reloading = loaded().beginLoad("load-2")
        assertNotNull(reloading.completeLoad("load-2", sample()).hardError)
        assertEquals(reloading, reloading.completeLoad("obsolete-call", sample()))
    }
    @Test fun `queued edits cannot change drafts while explicitly reloading`() {
        val s = loaded().beginLoad("load-2")
        assertEquals(s, s.edit("displayName", "Must not be accepted"))
    }
    @Test fun `revision limit never wraps`() {
        val s = loaded().copy(editRevisions = mapOf("displayName" to MAX_SAFE_REVISION))
        val next = s.edit("displayName", "New")
        assertEquals(s.drafts, next.drafts)
        assertNotNull(next.hardError)
    }
}

class ProfileProtocolTest {
    private fun reject(json: String) { assertFailsWith<ProtocolException> { ProfileProtocol.decode(json.toByteArray()) } }
    @Test fun `actual Go fixtures decode`() {
        val directory = File(System.getProperty("ely.fixtures"))
        for ((name, expected) in listOf("ready" to "ready", "invalid" to "invalid", "saved" to "saved")) {
            val file = File(directory, "profile-$name.json")
            assertTrue(file.isFile, "Missing shared Go fixture: $file")
            assertEquals(expected, ProfileProtocol.decode(file.readBytes()).status)
        }
    }
    @Test fun `malformed and unsupported data have visible-fallback errors`() {
        reject("{")
        reject(sampleJSON().replace("\"protocolVersion\":\"1\"", "\"protocolVersion\":\"2\""))
        reject(sampleJSON().replace("\"type\":\"input\"", "\"type\":\"WebView\""))
        reject(sampleJSON().replace("\"type\":\"text\"", "\"type\":\"password\""))
        reject(sampleJSON().replace("\"capabilities\"", "\"unsupported\"" ).replace("\"requiredCapabilities\":[", "\"requiredCapabilities\":[\"slider\","))
        reject(sampleJSON().replace("\"id\":\"save-profile\"", "\"id\":\"display-name\""))
        reject(sampleJSON().replace("\"action\":\"save-profile\"", "\"action\":\"https://malicious.invalid/\""))
        reject(sampleJSON().replace("\"dataVersion\":0", "\"dataVersion\":9007199254740992"))
        reject(sampleJSON().replace("\"dataVersion\":0", "\"dataVersion\":\"0\""))
    }
    @Test fun `size and raw JSON nesting limits are enforced before parse`() {
        assertFailsWith<ProtocolException> { ProfileProtocol.decode(ByteArray(MAX_RESPONSE_BYTES + 1)) }
        reject("[".repeat(101) + "0" + "]".repeat(101))
        assertFailsWith<ProtocolException> { ProfileProtocol.decode(byteArrayOf(0xC3.toByte(), 0x28)) }
    }
    @Test fun `tree node and depth limits are bounded`() {
        val root = Json.parseToJsonElement(sampleJSON()).jsonObject
        fun envelope(region: JsonObject) = JsonObject(root + ("region" to region)).toString()
        val leaf = buildJsonObject { put("id", "leaf"); put("type", "text"); put("props", buildJsonObject { put("text", "") }) }
        var node = leaf
        for (i in 1..33) node = buildJsonObject { put("id", "stack-$i"); put("type", "stack"); put("props", JsonObject(emptyMap())); put("children", JsonArray(listOf(node))) }
        reject(envelope(buildJsonObject { put("id", "profile-region"); put("type", "region"); put("props", JsonObject(emptyMap())); put("children", JsonArray(listOf(node))) }))
        val many = (1..1001).map { i -> JsonObject(leaf + ("id" to JsonPrimitive("text-$i"))) }
        reject(envelope(JsonObject(root.getValue("region").jsonObject + ("children" to JsonArray(many)))))
    }
    @Test fun `unknown optional members are ignored and plain content remains plain`() {
        val root = Json.parseToJsonElement(sampleJSON()).jsonObject
        assertEquals(sample(), ProfileProtocol.decode(JsonObject(root + ("future" to JsonPrimitive("ignored"))).toString().toByteArray()))
        val s = loaded().edit("displayName", "<script>alert(1)</script>").beginSave("save-1")
        assertEquals("<script>alert(1)</script>", Json.parseToJsonElement(s.pending!!.body).jsonObject.getValue("fields").jsonObject.getValue("displayName").jsonPrimitive.content)
    }
}
