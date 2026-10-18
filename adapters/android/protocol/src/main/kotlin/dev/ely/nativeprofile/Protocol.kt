package dev.ely.nativeprofile

import kotlinx.serialization.json.*
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.UUID

const val MAX_RESPONSE_BYTES = 1_048_576
const val MAX_SAFE_REVISION = 9_007_199_254_740_991L
val CAPABILITIES = listOf("region", "form", "stack", "text", "input", "button", "notice", "switch", "checkbox", "select")

class ProtocolException(message: String) : Exception(message)

data class Action(val on: String, val action: String, val target: String)
data class SelectOption(val value: String, val label: String)

data class Node(
    val id: String,
    val type: String,
    val props: JsonObject,
    val children: List<Node>,
    val events: List<Action>,
) {
    fun string(key: String, default: String = "") = (props[key] as? JsonPrimitive)?.contentOrNull ?: default
    fun options(): List<SelectOption> = (props["options"] as? JsonArray)?.map {
        val option = it.jsonObject
        SelectOption(option.getValue("value").jsonPrimitive.content, option.getValue("label").jsonPrimitive.content)
    }.orEmpty()
    fun boolean(key: String) = (props[key] as? JsonPrimitive)?.booleanOrNull ?: false
}

data class Envelope(
    val screenID: String,
    val screenRevision: String,
    val sessionID: String,
    val requestID: String,
    val dataVersion: Long,
    val status: String,
    val csrfToken: String,
    val region: Node,
    val fields: Map<String, String>,
    val acknowledgedEdits: Map<String, Long>,
    val errors: Map<String, String>,
    val message: String,
)

data class SaveRequest(
    val screenRevision: String,
    val sessionID: String,
    val requestID: String,
    val dataVersion: Long,
    val fields: Map<String, String>,
    val editRevisions: Map<String, Long>,
) {
    fun body(): String = buildJsonObject {
        put("protocolVersion", "1"); put("screenID", "profile")
        put("screenRevision", screenRevision); put("sessionID", sessionID)
        put("requestID", requestID); put("dataVersion", dataVersion)
        put("nodeID", "profile-form"); put("event", "submit")
        put("action", "save-profile"); put("target", "profile-region")
        put("fields", JsonObject(fields.mapValues { JsonPrimitive(it.value) }))
        put("editRevisions", JsonObject(editRevisions.mapValues { JsonPrimitive(it.value) }))
        put("capabilities", JsonArray(CAPABILITIES.map(::JsonPrimitive)))
    }.toString()
}

object ProfileProtocol {
    private val json = Json { ignoreUnknownKeys = true; isLenient = false }
    private val stableID = Regex("[A-Za-z][A-Za-z0-9_-]{0,127}")
    private fun bad(message: String): Nothing = throw ProtocolException(message)
    private fun JsonObject.string(key: String, allowEmpty: Boolean = false): String {
        val p = this[key] as? JsonPrimitive ?: bad("Missing string: $key")
        if (!p.isString || (!allowEmpty && p.content.isEmpty())) bad("Invalid string: $key")
        return p.content
    }
    private fun JsonObject.obj(key: String): JsonObject = this[key] as? JsonObject ?: bad("Missing object: $key")
    private fun JsonObject.array(key: String): JsonArray = this[key] as? JsonArray ?: bad("Missing array: $key")
    private fun revision(value: JsonElement?): Long {
        val p = value as? JsonPrimitive ?: bad("Invalid revision")
        val n = if (p.isString) null else p.longOrNull
        if (n == null || n !in 0..MAX_SAFE_REVISION) bad("Invalid revision")
        return n
    }
    private fun strings(value: JsonObject) = value.mapValues { (_, v) ->
        val p = v as? JsonPrimitive ?: bad("Invalid field value")
        if (!p.isString) bad("Invalid field value")
        p.content
    }

    private fun parseObject(bytes: ByteArray): JsonObject {
        if (bytes.size > MAX_RESPONSE_BYTES) bad("Response exceeds 1 MiB")
        val text = try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: Exception) { bad("Response is not valid UTF-8") }
        // The JSON tree parser keeps only the last occurrence of a key. Scan raw
        // tokens first so neither literal nor escaped duplicate keys can disappear.
        // Full JSON grammar remains the parser's responsibility below.
        val objects = mutableListOf<MutableSet<String>?>()
        var offset = 0
        while (offset < text.length) {
            when (text[offset]) {
                '{', '[' -> {
                    objects.add(if (text[offset] == '{') mutableSetOf<String>() else null)
                    if (objects.size > 100) bad("JSON nesting limit exceeded")
                    offset++
                }
                '}', ']' -> {
                    if (objects.isEmpty()) bad("Malformed JSON response")
                    val objectFrame = objects.removeAt(objects.lastIndex)
                    if ((text[offset] == '}') != (objectFrame != null)) bad("Malformed JSON response")
                    offset++
                }
                '"' -> {
                    val start = offset++
                    var closed = false
                    while (offset < text.length) {
                        val c = text[offset++]
                        if (c == '\\') {
                            if (offset >= text.length) bad("Malformed JSON response")
                            offset++
                        } else if (c == '"') {
                            closed = true
                            break
                        }
                    }
                    if (!closed) bad("Malformed JSON response")
                    var next = offset
                    while (next < text.length && text[next] in " \t\r\n") next++
                    if (next < text.length && text[next] == ':') {
                        val keys = objects.lastOrNull() ?: bad("Malformed JSON response")
                        val key = try { json.parseToJsonElement(text.substring(start, offset)).jsonPrimitive.content }
                        catch (_: Exception) { bad("Malformed JSON key") }
                        if (!keys.add(key)) bad("Duplicate JSON key")
                    }
                }
                else -> offset++
            }
        }
        if (objects.isNotEmpty()) bad("Malformed JSON response")
        val root = try { json.parseToJsonElement(text) as? JsonObject ?: bad("Expected response object") }
        catch (e: ProtocolException) { throw e }
        catch (_: Exception) { bad("Malformed JSON response") }
        return root
    }

    fun errorMessage(bytes: ByteArray): String? = try { parseObject(bytes).obj("error").string("message").take(2000) } catch (_: ProtocolException) { null }

    fun decode(bytes: ByteArray): Envelope {
        val root = parseObject(bytes)
        if (root.string("protocolVersion") != "1") bad("Unsupported protocol version")
        if (root.string("screenID") != "profile") bad("Unsupported screen")
        root.array("requiredCapabilities").forEach {
            val p = it as? JsonPrimitive ?: bad("Invalid capability")
            if (!p.isString || p.content !in CAPABILITIES) bad("Unsupported required capability")
        }
        val seen = mutableSetOf<String>()
        val inputNames = mutableSetOf<String>(); var formCount = 0; var submitCount = 0
        fun parseNode(o: JsonObject, level: Int, insideForm: Boolean): Node {
            if (level > 32 || seen.size >= 1000) bad("Native tree limit exceeded")
            val id = o.string("id")
            if (!stableID.matches(id) || id.startsWith("sdui-internal-") || !seen.add(id)) bad("Invalid or duplicate node ID")
            val type = o.string("type")
            if (type !in CAPABILITIES) bad("Unsupported native component: $type")
            val props = o.obj("props")
            val events = (o["events"] as? JsonArray ?: if (o.containsKey("events")) bad("Invalid events") else JsonArray(emptyList())).map { value ->
                val e = value as? JsonObject ?: bad("Invalid event")
                val action = Action(e.string("on"), e.string("action"), e.string("target"))
                if (type != "form" || id != "profile-form" || action != Action("submit", "save-profile", "profile-region")) bad("Unsupported action")
                action
            }
            fun optionalString(name: String) { if (props.containsKey(name)) props.string(name, true) }
            fun requiredString(name: String) { props.string(name) }
            fun bool(name: String) {
                if (props.containsKey(name)) {
                    val p = props[name] as? JsonPrimitive ?: bad("Invalid boolean: $name")
                    if (p.isString || p.booleanOrNull == null) bad("Invalid boolean: $name")
                }
            }
            fun enum(name: String, allowed: Set<String>) {
                if (props.containsKey(name) && props.string(name) !in allowed) bad("Unsupported $name")
            }
            when (type) {
                "region" -> { optionalString("label"); if (level != 1 || id != "profile-region") bad("Unsupported region") }
                "form" -> {
                    optionalString("label"); formCount++
                    if (insideForm || id != "profile-form" || events.size != 1) bad("Invalid profile form")
                }
                "stack" -> {
                    enum("direction", setOf("row", "column")); enum("gap", setOf("none", "xs", "sm", "md", "lg"))
                    enum("align", setOf("start", "center", "end", "stretch"))
                }
                "text" -> props.string("text", true)
                "notice" -> { props.string("text", true); optionalString("title"); bool("urgent") }
                "input", "switch" -> {
                    requiredString("name"); requiredString("label")
                    if (!insideForm || !inputNames.add(props.string("name"))) bad("Unsupported or duplicate field")
                    if (type == "switch") bool("checked")
                    enum("type", setOf("text")); optionalString("value"); optionalString("placeholder")
                    listOf("disabled", "readonly", "required", "multiple").forEach(::bool)
                    if ((props["multiple"] as? JsonPrimitive)?.booleanOrNull == true) bad("Multiple input is unsupported")
                    if (type == "switch" && listOf("readonly", "required").any { (props[it] as? JsonPrimitive)?.booleanOrNull == true }) bad("Unsupported switch mode")
                }
                "checkbox", "select" -> {
                    requiredString("name"); requiredString("label"); bool("disabled"); optionalString("value")
                    if (!insideForm || !inputNames.add(props.string("name"))) bad("Unsupported or duplicate field")
                    val allowed = if (type == "checkbox") setOf("name", "label", "value", "checked", "disabled")
                        else setOf("name", "label", "value", "disabled", "options")
                    if (props.keys.any { it !in allowed }) bad("Unsupported $type property")
                    if (listOf("label", "value").any { props.containsKey(it) && props.string(it, true).toByteArray(Charsets.UTF_8).size > 16_384 }) bad("Oversized $type property")
                    if (type == "checkbox") bool("checked") else {
                        val options = props.array("options")
                        if (options.size !in 1..64) bad("Invalid select options count")
                        val values = mutableSetOf<String>()
                        options.forEach { element ->
                            val option = element as? JsonObject ?: bad("Invalid select option")
                            if (option.keys != setOf("value", "label")) bad("Unsupported select option property")
                            val value = option.string("value")
                            val label = option.string("label")
                            if (!values.add(value) || listOf(value, label).any { it.toByteArray(Charsets.UTF_8).size > 16_384 }) bad("Invalid select option")
                        }
                    }
                }
                "button" -> {
                    requiredString("label"); enum("type", setOf("submit")); bool("disabled")
                    enum("variant", setOf("default", "primary", "secondary", "outline", "ghost", "destructive"))
                    enum("size", setOf("default", "xs", "sm", "lg"))
                    if (!insideForm || props["type"]?.jsonPrimitive?.content != "submit") bad("Unsupported button action")
                    submitCount++
                }
            }
            val children = when (val c = o["children"]) {
                null -> emptyList()
                is JsonArray -> c.map { parseNode(it as? JsonObject ?: bad("Invalid child node"), level + 1, insideForm || type == "form") }
                else -> bad("Invalid children")
            }
            if (type !in setOf("region", "form", "stack") && children.isNotEmpty()) bad("Leaf has children")
            return Node(id, type, props, children, events)
        }
        val region = parseNode(root.obj("region"), 1, false)
        if (region.type != "region" || formCount != 1 || inputNames.isEmpty() || submitCount < 1) bad("Incomplete profile screen")
        val fields = strings(root.obj("fields"))
        val errors = strings(root.obj("errors"))
        val edits = root.obj("acknowledgedEdits").mapValues { revision(it.value) }
        if (fields.keys != inputNames || fields.size > 64 || fields.keys.any { !Regex("[A-Za-z][A-Za-z0-9_]{0,63}").matches(it) } ||
            fields.values.any { it.toByteArray(Charsets.UTF_8).size > 16_384 } || errors.keys.any { it !in fields } || edits.keys.any { it !in fields }) bad("Unsupported fields")
        fun validateSelections(node: Node) {
            if (node.type in setOf("switch", "checkbox") && fields[node.string("name")] !in setOf("true", "false")) bad("Invalid boolean field")
            if (node.type == "select" && node.options().none { it.value == fields[node.string("name")] }) bad("Invalid select field")
            node.children.forEach(::validateSelections)
        }
        validateSelections(region)
        val status = root.string("status")
        if (status !in setOf("ready", "saved", "invalid", "conflict")) bad("Unsupported response status")
        if ((status == "ready" && edits.isNotEmpty()) || (status != "ready" && edits.keys != fields.keys)) bad("Missing acknowledged edits")
        return Envelope("profile", root.string("screenRevision"), root.string("sessionID"), root.string("requestID"),
            revision(root["dataVersion"]), status, root.string("csrfToken"), region, fields, edits, errors, root.string("message", true))
    }

    fun newRequestID(): String = UUID.randomUUID().toString()
}
