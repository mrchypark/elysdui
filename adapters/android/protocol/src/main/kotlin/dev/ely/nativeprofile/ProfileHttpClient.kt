package dev.ely.nativeprofile

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder

/** Fixed host-owned endpoint; the JSON tree cannot configure URLs or headers. */
class ProfileHttpClient(endpoint: String, allowDemoHttp: Boolean = false) {
    private val endpoint = URI(endpoint)
    private val cookies = CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER)

    init {
        require(this.endpoint.rawQuery == null && this.endpoint.rawFragment == null && this.endpoint.userInfo == null)
        require(this.endpoint.path == "/native/profile")
        require(this.endpoint.scheme == "https" || (allowDemoHttp && this.endpoint.scheme == "http" &&
            this.endpoint.host in setOf("localhost", "127.0.0.1", "10.0.2.2"))) { "The endpoint must use HTTPS, except the debug demo host." }
    }

    fun load(requestID: String): Envelope {
        val query = "protocolVersion=1&requestID=${encode(requestID)}&capabilities=${encode(CAPABILITIES.joinToString(","))}"
        return exchange(URI("$endpoint?$query"), null, null)
    }

    fun save(pending: PendingSave): Envelope = exchange(endpoint, pending.body, pending.csrfToken)

    @Synchronized
    private fun exchange(uri: URI, body: String?, csrfToken: String?): Envelope {
        val connection = uri.toURL().openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.requestMethod = if (body == null) "GET" else "POST"
        connection.setRequestProperty("Accept", "application/json")
        cookies.get(uri, emptyMap()).filterValues { it.isNotEmpty() }.forEach { (header, values) -> connection.setRequestProperty(header, values.joinToString("; ")) }
        try {
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("X-CSRF-Token", csrfToken)
                val bytes = body.toByteArray(Charsets.UTF_8)
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            cookies.put(uri, connection.headerFields.filterKeys { it != null })
            val supportedStatus = status in setOf(200, 409, 422)
            // A failed gateway might have received the mutation; exact retry is safe.
            if (status >= 500 || status == 408 || status == 429) throw IOException("Temporary HTTP failure: $status")
            if (supportedStatus && connection.contentType?.substringBefore(';')?.trim()?.lowercase() != "application/json") throw ProtocolException("Expected a JSON response.")
            if (connection.contentLengthLong > MAX_RESPONSE_BYTES) throw ProtocolException("Response exceeds 1 MiB")
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            val bytes = stream?.use { input ->
                val out = ByteArrayOutputStream()
                val chunk = ByteArray(8192)
                while (true) {
                    val count = input.read(chunk)
                    if (count < 0) break
                    if (out.size() + count > MAX_RESPONSE_BYTES) throw ProtocolException("Response exceeds 1 MiB")
                    out.write(chunk, 0, count)
                }
                out.toByteArray()
            } ?: ByteArray(0)
            if (!supportedStatus) throw ProtocolException(ProfileProtocol.errorMessage(bytes)
                ?: "The server rejected this session or request (HTTP $status). Resolve the server error, then reload.")
            val envelope = ProfileProtocol.decode(bytes)
            if (status == 422 && envelope.status != "invalid" || status == 409 && envelope.status != "conflict" ||
                status == 200 && envelope.status !in setOf("ready", "saved")) throw ProtocolException("HTTP status and response do not agree.")
            return envelope
        } finally { connection.disconnect() }
    }
    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
}
