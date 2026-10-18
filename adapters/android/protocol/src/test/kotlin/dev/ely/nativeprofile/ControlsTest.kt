package dev.ely.nativeprofile

import java.io.File
import kotlinx.serialization.json.*
import org.junit.Assume.assumeTrue
import kotlin.test.*

class ControlsTest {
    private fun fixture(name: String = "profile-controls-ready") = ProfileProtocol.decode(File(System.getProperty("ely.fixtures"), "$name.json").readBytes())
    @Test fun `multiple fields reconcile independently with exact retry`() {
        val ready = fixture()
        val pending = ProfileState().beginLoad(ready.requestID).acceptLoad(ready)
            .edit("displayName", "  Grace Hopper  ").edit("company", "  Example Labs  ")
            .edit("notifications", "true").edit("digestConsent", "true").edit("colorTheme", "dark").beginSave("save-controls")
        val later = pending.edit("company", "Later company").edit("digestConsent", "false").edit("colorTheme", "light").networkFailed("save-controls").retrySave()
        assertEquals(pending.pending, later.pending)
        val saved = fixture("profile-controls-saved").copy(requestID = "save-controls", acknowledgedEdits = pending.pending!!.request.editRevisions)
        val final = later.acceptSave(saved)
        assertEquals("Later company", final.drafts["company"])
        assertEquals("Example Labs", final.baseline["company"])
        assertEquals("Grace Hopper", final.drafts["displayName"])
        assertEquals("true", final.drafts["notifications"])
        assertEquals("false", final.drafts["digestConsent"])
        assertEquals("light", final.drafts["colorTheme"])
        assertEquals("true", final.baseline["digestConsent"])
        assertEquals("dark", final.baseline["colorTheme"])
    }
    @Test fun `invalid boolean and undeclared fields are rejected`() {
        val root = Json.parseToJsonElement(File(System.getProperty("ely.fixtures"), "profile-controls-ready.json").readText()).jsonObject
        for (fields in listOf(root.getValue("fields").jsonObject + ("notifications" to JsonPrimitive("yes")),
            root.getValue("fields").jsonObject + ("undeclared" to JsonPrimitive("secret")),
            root.getValue("fields").jsonObject - "company")) {
            val invalid = JsonObject(root + ("fields" to JsonObject(fields))).toString().toByteArray()
            assertFailsWith<ProtocolException> { ProfileProtocol.decode(invalid) }
        }
    }
    @Test fun `changed field set during save blocks reconciliation`() {
        val ready = fixture()
        val state = ProfileState().beginLoad(ready.requestID).acceptLoad(ready).beginSave("save-controls")
        val reply = fixture("profile-controls-saved").copy(requestID = "save-controls", fields = mapOf("displayName" to "Ada"))
        assertNotNull(state.acceptSave(reply).hardError)
    }
    @Test fun `real server invalid selection fixture keeps persisted fields`() {
        val invalid = fixture("profile-controls-invalid")
        assertEquals("invalid", invalid.status)
        assertEquals("true", invalid.fields["digestConsent"])
        assertEquals("dark", invalid.fields["colorTheme"])
        assertNotNull(invalid.errors["colorTheme"])
        assertEquals(invalid.fields.keys, invalid.acknowledgedEdits.keys)
    }
    private fun root(): JsonObject = Json.parseToJsonElement(File(System.getProperty("ely.fixtures"), "profile-controls-ready.json").readText()).jsonObject
    private fun changeNode(root: JsonObject, type: String, transform: (JsonObject) -> JsonObject): JsonObject {
        fun visit(node: JsonObject): JsonObject {
            val changed = if (node["type"]?.jsonPrimitive?.content == type) transform(node) else node
            val children = changed["children"] as? JsonArray ?: return changed
            return JsonObject(changed + ("children" to JsonArray(children.map { visit(it.jsonObject) })))
        }
        return JsonObject(root + ("region" to visit(root.getValue("region").jsonObject)))
    }
    private fun changeProps(type: String, transform: (JsonObject) -> JsonObject) = changeNode(root(), type) {
        JsonObject(it + ("props" to transform(it.getValue("props").jsonObject)))
    }
    private fun decode(root: JsonObject) = ProfileProtocol.decode(root.toString().toByteArray())

    @Test fun `selection options decode with strict closed bounded objects`() {
        val options = fixture().region.let { region ->
            fun find(node: Node): Node? = if (node.type == "select") node else node.children.firstNotNullOfOrNull(::find)
            find(region)!!.options()
        }
        assertEquals(listOf(SelectOption("system", "System"), SelectOption("light", "Light"), SelectOption("dark", "Dark")), options)
        val valid = buildJsonObject { put("value", "system"); put("label", "System") }
        val malformed = listOf<JsonElement>(JsonNull, JsonPrimitive("system"), JsonObject(emptyMap()),
            JsonArray(emptyList()), JsonArray(List(65) { valid }), JsonArray(listOf(valid, valid)),
            JsonArray(listOf(JsonPrimitive("system"))),
            JsonArray(listOf(JsonObject(valid - "label"))),
            JsonArray(listOf(JsonObject(valid + ("value" to JsonPrimitive(""))))),
            JsonArray(listOf(JsonObject(valid + ("label" to JsonPrimitive(""))))),
            JsonArray(listOf(JsonObject(valid + ("label" to JsonNull)))),
            JsonArray(listOf(JsonObject(valid + ("label" to JsonPrimitive(true))))),
            JsonArray(listOf(JsonObject(valid + ("value" to JsonPrimitive(1))))),
            JsonArray(listOf(JsonObject(valid + ("disabled" to JsonPrimitive(false))))),
            JsonArray(listOf(JsonObject(valid + ("label" to JsonPrimitive("é".repeat(8193)))))))
        malformed.forEach { optionsValue ->
            assertFailsWith<ProtocolException> { decode(changeProps("select") { JsonObject(it + ("options" to optionsValue)) }) }
        }
        assertFailsWith<ProtocolException> { decode(changeProps("select") { JsonObject(it - "options") }) }
        val boundaryOption = JsonObject(valid + ("label" to JsonPrimitive("é".repeat(8192))))
        decode(changeProps("select") { JsonObject(it + ("options" to JsonArray(listOf(boundaryOption)))) })
    }

    @Test fun `duplicate option keys including escaped aliases fail before tree decoding`() {
        val original = root().toString()
        for ((key, value) in listOf("value" to "system", "label" to "System")) {
            val member = "\"$key\":\"$value\""
            assertTrue(original.contains(member))
            val escapedKey = "\\u" + key.first().code.toString(16).padStart(4, '0') + key.drop(1)
            for (duplicate in listOf(member, "\"$escapedKey\":\"$value\"")) {
                val raw = original.replaceFirst(member, "$member,$duplicate")
                assertFailsWith<ProtocolException> { ProfileProtocol.decode(raw.toByteArray()) }
            }
        }
        val escaped = original.replaceFirst("\"label\":\"System\"", "\"l\\u0061bel\":\"S\\u0079stem\"")
        assertEquals(fixture(), ProfileProtocol.decode(escaped.toByteArray()))
        val punctuation = "Quotes \" and slash \\ with { [ : , } ]"
        val changed = changeProps("select") { props ->
            val options = props.getValue("options").jsonArray.mapIndexed { index, option ->
                if (index == 0) JsonObject(option.jsonObject + ("label" to JsonPrimitive(punctuation))) else option
            }
            JsonObject(props + ("options" to JsonArray(options)))
        }
        decode(changed)
    }

    @Test fun `selection flags and authoritative values are strict`() {
        for ((type, keys) in mapOf("checkbox" to listOf("readonly", "required", "indeterminate", "multiple", "placeholder"),
            "select" to listOf("multiple", "placeholder", "readonly", "required"))) {
            keys.forEach { key ->
                assertFailsWith<ProtocolException> { decode(changeProps(type) { JsonObject(it + (key to JsonPrimitive(false))) }) }
            }
            assertFailsWith<ProtocolException> { decode(changeProps(type) { JsonObject(it + ("unknown" to JsonPrimitive(false))) }) }
            assertFailsWith<ProtocolException> { decode(changeProps(type) { JsonObject(it + ("value" to JsonNull)) }) }
            listOf("label", "value").forEach { key ->
                assertFailsWith<ProtocolException> { decode(changeProps(type) { JsonObject(it + (key to JsonPrimitive("é".repeat(8193)))) }) }
            }
            listOf("name", "label").forEach { key ->
                assertFailsWith<ProtocolException> { decode(changeProps(type) { JsonObject(it - key) }) }
            }
            assertFailsWith<ProtocolException> { decode(changeProps(type) { JsonObject(it + ("disabled" to JsonPrimitive("false"))) }) }
        }
        assertFailsWith<ProtocolException> { decode(changeProps("checkbox") { JsonObject(it + ("checked" to JsonPrimitive("true"))) }) }
        for ((field, value) in listOf("digestConsent" to "yes", "digestConsent" to "TRUE", "colorTheme" to "unknown", "colorTheme" to "")) {
            assertFailsWith<ProtocolException> { decode(JsonObject(root() + ("fields" to JsonObject(root().getValue("fields").jsonObject + (field to JsonPrimitive(value)))))) }
        }
        // Contradictory presentation defaults are legal: envelope fields win.
        assertEquals("false", decode(changeProps("checkbox") { JsonObject(it + ("checked" to JsonPrimitive(true))) }).fields["digestConsent"])
        assertEquals("system", decode(changeProps("select") { JsonObject(it + ("value" to JsonPrimitive("dark"))) }).fields["colorTheme"])
    }

    @Test fun `invalid replies retain selection drafts and clear only current errors`() {
        val ready = fixture()
        val pending = ProfileState().beginLoad(ready.requestID).acceptLoad(ready)
            .edit("digestConsent", "true").edit("colorTheme", "dark").beginSave("selection-invalid")
        val later = pending.edit("colorTheme", "light")
        val invalid = ready.copy(requestID = "selection-invalid", status = "invalid",
            acknowledgedEdits = pending.pending!!.request.editRevisions,
            errors = mapOf("digestConsent" to "Confirm digest consent.", "colorTheme" to "Choose a theme."))
        val result = later.acceptSave(invalid)
        assertEquals(later.drafts, result.drafts)
        assertEquals(mapOf("digestConsent" to "Confirm digest consent."), result.errors)
        assertTrue(result.edit("digestConsent", "false").errors.isEmpty())
    }

    @Test fun `changed selection controls fail safely without replacing retained draft`() {
        val ready = fixture()
        val pending = ProfileState().beginLoad(ready.requestID).acceptLoad(ready).beginSave("changed")
            .edit("digestConsent", "true").edit("colorTheme", "dark")
        val mutations = listOf(
            changeNode(root(), "select") { JsonObject(it + ("id" to JsonPrimitive("renamed-select"))) },
            changeProps("checkbox") { JsonObject(it + ("disabled" to JsonPrimitive(true))) },
            changeProps("select") { JsonObject(it + ("options" to JsonArray(it.getValue("options").jsonArray.take(2)))) },
            changeNode(root(), "checkbox") { JsonObject(it + ("type" to JsonPrimitive("switch"))) })
        mutations.forEach { changed ->
            val reply = decode(changed).copy(requestID = "changed", status = "saved", dataVersion = 1,
                acknowledgedEdits = pending.pending!!.request.editRevisions)
            val result = pending.acceptSave(reply)
            assertNotNull(result.hardError)
            assertEquals(pending.drafts, result.drafts)
            assertEquals(ready, result.screen)
            assertNull(result.pending)
        }
    }
    @Test fun `real Go multiple fields save and reload`() {
        val base = System.getenv("ELY_NATIVE_CONTROLS_BASE_URL")
        assumeTrue("Controls Go server required", !base.isNullOrBlank())
        val client = ProfileHttpClient(base!!.trimEnd('/') + "/native/profile", allowDemoHttp = true)
        val ready = client.load(ProfileProtocol.newRequestID())
        var state = ProfileState().beginLoad(ready.requestID).acceptLoad(ready)
            .edit("company", "  Android Company  ").edit("notifications", "true")
            .edit("digestConsent", "true").edit("colorTheme", "dark").beginSave()
        val pending = state.pending!!
        state = state.acceptSave(client.save(pending))
        assertEquals("Android Company", state.drafts["company"])
        assertEquals("true", state.drafts["notifications"])
        assertEquals("true", state.drafts["digestConsent"])
        assertEquals("dark", state.drafts["colorTheme"])
        assertEquals(state.baseline, client.load(ProfileProtocol.newRequestID()).fields)
    }
}
