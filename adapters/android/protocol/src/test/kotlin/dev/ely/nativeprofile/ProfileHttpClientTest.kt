package dev.ely.nativeprofile

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.*

class ProfileHttpClientTest {
    @Test fun `transport retains session cookie sends CSRF and performs exact retry`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val bodies = mutableListOf<String>()
        val cookies = mutableListOf<String?>()
        val tokens = mutableListOf<String?>()
        val calls = AtomicInteger()
        server.createContext("/native/profile") { exchange ->
            calls.incrementAndGet()
            cookies.add(exchange.requestHeaders.getFirst("Cookie"))
            tokens.add(exchange.requestHeaders.getFirst("X-CSRF-Token"))
            val body = exchange.requestBody.bufferedReader().readText()
            bodies.add(body)
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.responseHeaders.add("Set-Cookie", "ely_native=demo-session; Path=/native; HttpOnly; SameSite=Lax")
            val response = if (exchange.requestMethod == "GET") sampleJSON() else sampleJSON()
                .replace("\"requestID\":\"load-1\"", "\"requestID\":\"save-1\"")
                .replace("\"status\":\"ready\"", "\"status\":\"saved\"")
                .replace("\"dataVersion\":0", "\"dataVersion\":1")
                .replace("\"acknowledgedEdits\":{}", "\"acknowledgedEdits\":{\"displayName\":0}")
            val bytes = response.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
            exchange.close()
        }
        server.start()
        try {
            val client = ProfileHttpClient("http://127.0.0.1:${server.address.port}/native/profile", allowDemoHttp = true)
            val ready = client.load("load-1")
            val pending = ProfileState().beginLoad("load-1").acceptLoad(ready).beginSave("save-1").pending!!
            assertEquals("saved", client.save(pending).status)
            assertEquals("saved", client.save(pending).status)
            assertEquals(3, calls.get())
            assertNull(cookies.first())
            assertTrue(cookies[1].orEmpty().contains("ely_native=demo-session"))
            assertEquals("csrf-1", tokens[1])
            assertEquals(pending.body, bodies[1])
            assertEquals(bodies[1], bodies[2])
        } finally { server.stop(0) }
    }
    @Test fun `hard HTTP status preserves server recovery guidance`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val guidance = "Session request capacity reached. Wait for expiry or restart the demo server before reloading."
        server.createContext("/native/profile") { exchange ->
            val bytes = """{"error":{"code":"replay_capacity","message":"$guidance"}}""".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(403, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
            exchange.close()
        }
        server.start()
        try {
            val client = ProfileHttpClient("http://127.0.0.1:${server.address.port}/native/profile", true)
            val error = assertFailsWith<ProtocolException> { client.load("load-1") }
            assertEquals(guidance, error.message)
        } finally { server.stop(0) }
    }
    @Test fun `transport refuses arbitrary cleartext hosts and JSON-controlled paths`() {
        assertFailsWith<IllegalArgumentException> { ProfileHttpClient("http://example.com/native/profile", true) }
        assertFailsWith<IllegalArgumentException> { ProfileHttpClient("http://127.0.0.1/native/profile") }
        assertFailsWith<IllegalArgumentException> { ProfileHttpClient("https://example.com/elsewhere") }
        assertFailsWith<IllegalArgumentException> { ProfileHttpClient("https://user:password@example.com/native/profile") }
    }
    @Test fun `redirects and oversized content length do not replace screen`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var oversized = false
        server.createContext("/native/profile") { exchange ->
            if (!oversized) {
                exchange.responseHeaders.add("Location", "https://example.invalid/native/profile")
                exchange.sendResponseHeaders(302, -1)
            } else {
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, MAX_RESPONSE_BYTES + 1L)
            }
            exchange.close()
        }
        server.start()
        try {
            val client = ProfileHttpClient("http://127.0.0.1:${server.address.port}/native/profile", true)
            assertFailsWith<ProtocolException> { client.load("load-1") }
            oversized = true
            assertFailsWith<ProtocolException> { client.load("load-2") }
        } finally { server.stop(0) }
    }
}
