package dev.ely.nativeprofile

import kotlinx.serialization.json.JsonObject

/** An immutable reducer. All transitions are made on the UI thread by the app. */
data class PendingSave(val request: SaveRequest, val body: String, val csrfToken: String, val inFlight: Boolean)

data class ProfileState(
    val screen: Envelope? = null,
    val baseline: Map<String, String> = emptyMap(),
    val drafts: Map<String, String> = emptyMap(),
    val editRevisions: Map<String, Long> = emptyMap(),
    val errors: Map<String, String> = emptyMap(),
    val pending: PendingSave? = null,
    val loadingID: String? = null,
    val message: String = "",
    val hardError: String? = null,
    val retryMessage: String? = null,
) {
    val canSave: Boolean get() = screen != null && pending == null && loadingID == null && hardError == null
    val dirty: Boolean get() = drafts != baseline

    fun beginLoad(id: String): ProfileState = copy(loadingID = id, pending = null, hardError = null, retryMessage = null)

    fun acceptLoad(reply: Envelope): ProfileState {
        if (loadingID != reply.requestID) return this
        if (reply.status != "ready" || reply.acknowledgedEdits.isNotEmpty()) return failLoad(reply.requestID, "The server returned an unexpected load response.")
        if (screen?.sessionID == reply.sessionID && reply.dataVersion < screen.dataVersion) return this
        return ProfileState(screen = reply, baseline = reply.fields, drafts = reply.fields,
            editRevisions = reply.fields.mapValues { 0L }, message = reply.message)
    }

    fun completeLoad(issuedID: String, reply: Envelope): ProfileState {
        if (loadingID != issuedID) return this
        val next = acceptLoad(reply)
        return if (next.loadingID == issuedID) next.failLoad(issuedID, "The server returned a stale or unrelated profile response. Please reload.") else next
    }

    fun failLoad(id: String, detail: String): ProfileState =
        if (loadingID == id) copy(loadingID = null, hardError = detail) else this

    fun edit(field: String, value: String): ProfileState {
        if (loadingID != null || field !in drafts || drafts[field] == value) return this
        val revision = editRevisions.getValue(field)
        if (revision == MAX_SAFE_REVISION) return copy(hardError = "The edit limit was reached. Reload to continue.")
        return copy(drafts = drafts + (field to value), editRevisions = editRevisions + (field to revision + 1),
            errors = errors - field, message = if (screen?.status == "invalid") "" else message)
    }

    fun beginSave(id: String = ProfileProtocol.newRequestID()): ProfileState {
        if (!canSave) return this
        val current = screen ?: return this
        val request = SaveRequest(current.screenRevision, current.sessionID, id, current.dataVersion, drafts.toMap(), editRevisions.toMap())
        return copy(pending = PendingSave(request, request.body(), current.csrfToken, true),
            retryMessage = null, message = "Saving…")
    }

    fun retrySave(): ProfileState {
        val request = pending ?: return this
        if (request.inFlight || hardError != null) return this
        return copy(pending = request.copy(inFlight = true), retryMessage = null, message = "Retrying the same save…")
    }

    fun networkFailed(id: String): ProfileState {
        val request = pending ?: return this
        if (id != request.request.requestID) return this
        return copy(pending = request.copy(inFlight = false),
            retryMessage = "The save could not be confirmed. Retry will send the same request. Your later edits are kept.", message = "")
    }

    fun hardFailed(id: String, detail: String): ProfileState {
        if (pending?.request?.requestID != id) return this
        return copy(pending = null, hardError = detail, retryMessage = null, message = "")
    }

    fun completeSave(issuedID: String, reply: Envelope): ProfileState {
        if (pending?.request?.requestID != issuedID) return this
        val next = acceptSave(reply)
        return if (next.pending?.request?.requestID == issuedID) next.networkFailed(issuedID) else next
    }

    fun acceptSave(reply: Envelope): ProfileState {
        val active = pending ?: return this
        val current = screen ?: return this
        // Ignore stale, unrelated and duplicate replies without changing any local state.
        if (reply.requestID != active.request.requestID || reply.sessionID != current.sessionID || reply.screenID != current.screenID ||
            reply.dataVersion < current.dataVersion) return this
        if (reply.fields.keys != active.request.fields.keys) return hardFailed(reply.requestID, "The field set changed during a save. Reload before continuing.")
        if (reply.status == "saved" && reply.dataVersion <= active.request.dataVersion) return hardFailed(reply.requestID, "The save response did not advance the server version.")
        if (reply.status == "ready") return hardFailed(reply.requestID, "The server returned an unexpected save response.")
        if (reply.acknowledgedEdits != active.request.editRevisions) return hardFailed(reply.requestID, "The server did not acknowledge the submitted edits.")
        // A retained edit must never be reinterpreted under a different control mode
        // or an option set that no longer represents it. Keep the previous screen.
        fun controls(node: Node): Map<String, Triple<String, String, JsonObject>> {
            val own = if (node.type in setOf("input", "switch", "checkbox", "select")) {
                val modes = node.props.filterKeys { it in setOf("type", "readonly", "disabled", "required", "multiple", "indeterminate", "options") }
                mapOf(node.string("name") to Triple(node.id, node.type, JsonObject(modes)))
            } else emptyMap()
            return own + node.children.flatMap { controls(it).entries }.associate { it.toPair() }
        }
        if (controls(current.region) != controls(reply.region)) return hardFailed(reply.requestID, "The field controls changed during a save. Reload before continuing.")
        val adoptedDrafts = if (reply.status == "saved") drafts.mapValues { (field, draft) ->
            if (editRevisions[field] == reply.acknowledgedEdits[field]) reply.fields.getValue(field) else draft
        } else drafts
        val activeErrors = reply.errors.filter { (field, _) -> editRevisions[field] == reply.acknowledgedEdits[field] }
        return copy(screen = reply, baseline = reply.fields, drafts = adoptedDrafts, errors = activeErrors,
            pending = null, retryMessage = null, hardError = null, message = if (reply.status == "invalid" && activeErrors.isEmpty() && editRevisions != reply.acknowledgedEdits) "" else reply.message)
    }
}
