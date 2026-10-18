import XCTest
@testable import ElyNativeCore

final class ProtocolTests: XCTestCase {
    func ready() throws -> ProfileEnvelope {
        try EnvelopeDecoder.decode(Data(contentsOf: ProfileStateTests.fixtureDirectory.appendingPathComponent("profile-ready.json")))
    }
    func encoded(_ envelope: ProfileEnvelope) throws -> Data { try JSONEncoder().encode(envelope) }

    func testUnsupportedProtocolCapabilityAndTypeAreRejected() throws {
        var response = try ready()
        response.protocolVersion = "2"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
        response = try ready()
        response.requiredCapabilities.append("slider")
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
        response = try ready()
        response.region.children[0].children[0].type = "webview"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
    }

    func testDuplicateIDsAndUnsupportedActionAreRejected() throws {
        var response = try ready()
        response.region.children[0].children[0].id = "profile-region"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
        response = try ready()
        response.region.children[0].children[2].events[0].action = "https://evil.invalid/save"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
    }

    func testMissingSubmitAndUnsupportedInputAreRejected() throws {
        var response = try ready()
        response.region.children[0].children[2].children.removeLast()
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
        response = try ready()
        response.region.children[0].children[2].children[0].props.type = "password"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
        response = try ready()
        response.region.children[0].children[2].children[0].props.name = "secret"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
    }

    func testSafeIntegerAndAcknowledgmentBounds() throws {
        var response = try ready()
        response.dataVersion = 9_007_199_254_740_992
        XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
        for status in [ResponseStatus.saved, .invalid, .conflict] {
            response = try ready()
            response.status = status
            XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
            response.acknowledgedEdits = ["displayName": 9_007_199_254_740_992]
            XCTAssertThrowsError(try EnvelopeDecoder.validate(response))
            response.acknowledgedEdits = ["displayName": 1]
            XCTAssertNoThrow(try EnvelopeDecoder.validate(response))
        }
    }

    func testRequiredTextMayBeEmpty() throws {
        var response = try ready()
        response.region.children[0].children[0].props.text = ""
        response.region.children[0].children[1].props.text = ""
        XCTAssertNoThrow(try EnvelopeDecoder.validate(response))
    }

    func testResponseByteNodeAndDepthLimits() throws {
        XCTAssertThrowsError(try EnvelopeDecoder.decode(Data(repeating: 32, count: NativeProtocol.maximumResponseBytes + 1)))
        var response = try ready()
        let node = response.region.children[0].children[0]
        for index in 0..<1_000 {
            var copy = node
            copy.id = "extra-\(index)"
            response.region.children.append(copy)
        }
        XCTAssertThrowsError(try EnvelopeDecoder.decode(encoded(response)))
        response = try ready()
        var nested = response.region.children[0]
        nested.children = []
        for index in 0..<33 {
            var wrapper = nested
            wrapper.id = "deep-\(index)"
            wrapper.children = [nested]
            nested = wrapper
        }
        response.region.children.append(nested)
        XCTAssertThrowsError(try EnvelopeDecoder.decode(encoded(response)))
    }

    func testUnknownMembersIgnoredButKnownPropertyTypesRemainStrict() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded(ready())) as? [String: Any])
        object["futureMetadata"] = ["anything": true]
        XCTAssertNoThrow(try EnvelopeDecoder.decode(JSONSerialization.data(withJSONObject: object)))
        var region = try XCTUnwrap(object["region"] as? [String: Any])
        region["props"] = ["label": 123]
        object["region"] = region
        XCTAssertThrowsError(try EnvelopeDecoder.decode(JSONSerialization.data(withJSONObject: object)))
    }

    func testDuplicateKeysRejectedBeforeTreeDecoding() throws {
        let original = String(decoding: try encoded(ready()), as: UTF8.self)
        for duplicate in [#""region":{},"#, #""\u0072egion":{},"#] {
            let json = "{" + duplicate + String(original.dropFirst())
            XCTAssertThrowsError(try EnvelopeDecoder.decode(Data(json.utf8))) { error in
                XCTAssertTrue((error as? ProtocolFailure)?.message.contains("Duplicate JSON") == true)
            }
        }
        for json in [#"{"a":{"label":"first","label":"last"}}"#,
                     #"{"a":[{"label":1,"\u006cabel":2}]}"#] {
            XCTAssertThrowsError(try EnvelopeDecoder.rejectAmbiguousJSON(Data(json.utf8)))
        }
        XCTAssertNoThrow(try EnvelopeDecoder.rejectAmbiguousJSON(Data(#"{"a":{"label":"one"},"b":{"label":"two"},"text":"colon: and escaped \" quote"}"#.utf8)))
    }

    func testDuplicateRegionCannotHideOversizedOrDeepTreeFromPreflight() throws {
        var response = try ready()
        let leaf = response.region.children[0].children[0]
        for index in 0..<1_100 {
            var node = leaf
            node.id = "extra-\(index)"
            response.region.children.append(node)
        }
        var deep = response.region.children[0]
        deep.children = []
        for index in 0..<40 {
            var wrapper = deep
            wrapper.id = "deep-\(index)"
            wrapper.children = [deep]
            deep = wrapper
        }
        response.region.children.append(deep)
        let original = String(decoding: try encoded(response), as: UTF8.self)
        // Before the guard, Foundation parsers disagreed on which region to use.
        for json in ["{\"region\":{}," + String(original.dropFirst()),
                     String(original.dropLast()) + ",\"region\":{}}"] {
            XCTAssertThrowsError(try EnvelopeDecoder.decode(Data(json.utf8))) { error in
                XCTAssertTrue(error is ProtocolFailure)
            }
        }
    }

    func testWideJSONObjectPreflightKeepsAllKeysWithoutCopyingSets() throws {
        // 50,000 ignored members fit below 1 MiB. A value-copy frame caused
        // quadratic Set copy-on-write before the normal decoder could validate.
        let members = (0..<50_000).map { "\"metadata\($0)\":0" }.joined(separator: ",")
        let data = Data(("{" + members + "}").utf8)
        XCTAssertLessThan(data.count, NativeProtocol.maximumResponseBytes)
        measure {
            do { try EnvelopeDecoder.rejectAmbiguousJSON(data) }
            catch { XCTFail("Wide-object preflight failed: \(error)") }
        }
        let duplicate = Data(("{" + members + ",\"metadata49999\":1}").utf8)
        XCTAssertThrowsError(try EnvelopeDecoder.rejectAmbiguousJSON(duplicate))
    }

    func testTransportOriginPolicy() throws {
        XCTAssertNoThrow(try HTTPProfileTransport(baseURL: URL(string: "https://example.com")!))
        XCTAssertNoThrow(try HTTPProfileTransport(baseURL: URL(string: "http://127.0.0.1:8094")!, allowLocalHTTP: true))
        XCTAssertThrowsError(try HTTPProfileTransport(baseURL: URL(string: "http://127.0.0.1:8094")!))
        XCTAssertThrowsError(try HTTPProfileTransport(baseURL: URL(string: "http://example.com")!, allowLocalHTTP: true))
        XCTAssertThrowsError(try HTTPProfileTransport(baseURL: URL(string: "https://user:pass@example.com")!))
        XCTAssertThrowsError(try HTTPProfileTransport(baseURL: URL(string: "https://example.com/remote/action")!))
    }
}
