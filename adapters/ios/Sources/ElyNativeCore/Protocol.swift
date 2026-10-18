import Foundation

public enum NativeProtocol {
    public static let version = "1"
    public static let capabilities = ["region", "form", "stack", "text", "input", "button", "notice", "switch", "checkbox", "select"]
    public static let maximumResponseBytes = 1_048_576
    public static let maximumNodes = 1_000
    public static let maximumDepth = 32
}

public struct ProtocolFailure: Error, LocalizedError, Equatable, Sendable {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}

/// Option records are closed: unknown members cannot silently alter selection semantics.
public struct SelectOption: Codable, Equatable, Sendable {
    public var value: String
    public var label: String
    public init(value: String, label: String) { self.value = value; self.label = label }
    private struct Key: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        guard Set(c.allKeys.map(\.stringValue)) == Set(["value", "label"]) else {
            throw ProtocolFailure("A select option must contain only value and label.")
        }
        value = try c.decode(String.self, forKey: Key(stringValue: "value")!)
        label = try c.decode(String.self, forKey: Key(stringValue: "label")!)
    }
}

public struct NodeProperties: Codable, Equatable, Sendable {
    public var options: [SelectOption]?
    public var checked: Bool?
    public var label: String?
    public var text: String?
    public var title: String?
    public var urgent: Bool?
    public var name: String?
    public var value: String?
    public var placeholder: String?
    public var type: String?
    public var required: Bool?
    public var disabled: Bool?
    public var readonly: Bool?
    public var multiple: Bool?
    public var direction: String?
    public var align: String?
    public var gap: String?
    public var variant: String?
    public var size: String?
}

public struct NodeEvent: Codable, Equatable, Sendable {
    public var on: String
    public var action: String
    public var target: String
}

public struct NativeNode: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var type: String
    public var props: NodeProperties
    public var children: [NativeNode]
    public var events: [NodeEvent]

    enum CodingKeys: String, CodingKey { case id, type, props, children, events }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(String.self, forKey: .type)
        props = try c.decode(NodeProperties.self, forKey: .props)
        children = try c.decodeIfPresent([NativeNode].self, forKey: .children) ?? []
        events = try c.decodeIfPresent([NodeEvent].self, forKey: .events) ?? []
    }
}

public enum ResponseStatus: String, Codable, Sendable { case ready, saved, invalid, conflict }

public struct ProfileEnvelope: Codable, Equatable, Sendable {
    public var protocolVersion: String
    public var screenID: String
    public var screenRevision: String
    public var sessionID: String
    public var requestID: String
    public var dataVersion: Int64
    public var status: ResponseStatus
    public var csrfToken: String
    public var requiredCapabilities: [String]
    public var region: NativeNode
    public var fields: [String: String]
    public var acknowledgedEdits: [String: Int64]
    public var errors: [String: String]
    public var message: String
}

/// A closed action request, never an arbitrary server-supplied URL or expression.
public struct SaveRequest: Codable, Equatable, Sendable {
    public let protocolVersion: String
    public let screenID: String
    public let screenRevision: String
    public let sessionID: String
    public let requestID: String
    public let dataVersion: Int64
    public let nodeID: String
    public let event: String
    public let action: String
    public let target: String
    public let fields: [String: String]
    public let editRevisions: [String: Int64]
    public let capabilities: [String]

    init(envelope: ProfileEnvelope, requestID: String, fields: [String: String], revisions: [String: Int64]) {
        protocolVersion = NativeProtocol.version
        screenID = envelope.screenID
        screenRevision = envelope.screenRevision
        sessionID = envelope.sessionID
        self.requestID = requestID
        dataVersion = envelope.dataVersion
        nodeID = "profile-form"
        event = "submit"
        action = "save-profile"
        target = "profile-region"
        self.fields = fields
        editRevisions = revisions
        capabilities = NativeProtocol.capabilities
    }
}

public enum EnvelopeDecoder {
    public static func decode(_ data: Data) throws -> ProfileEnvelope {
        guard data.count <= NativeProtocol.maximumResponseBytes else {
            throw ProtocolFailure("The response exceeds the 1 MiB limit.")
        }
        try rejectAmbiguousJSON(data)
        // Preflight before recursively decoding the tree. This bounds both rendering and decoding.
        let object = try JSONSerialization.jsonObject(with: data)
        guard let root = (object as? [String: Any])?["region"] as? [String: Any] else {
            throw ProtocolFailure("The response does not contain a replacement region.")
        }
        var queue: [([String: Any], Int)] = [(root, 1)]
        var count = 0
        while let (node, depth) = queue.popLast() {
            count += 1
            guard count <= NativeProtocol.maximumNodes, depth <= NativeProtocol.maximumDepth else {
                throw ProtocolFailure("The screen exceeds the supported size or depth.")
            }
            if let type = node["type"] as? String, ["checkbox", "select"].contains(type) {
                let allowed: Set<String> = type == "checkbox"
                    ? ["name", "label", "checked", "disabled", "value"]
                    : ["name", "label", "value", "disabled", "options"]
                guard let props = node["props"] as? [String: Any],
                      Set(props.keys).isSubset(of: allowed), !props.values.contains(where: { $0 is NSNull }) else {
                    throw ProtocolFailure("Unsupported selection control properties.")
                }
            }
            if let rawChildren = node["children"] {
                guard let children = rawChildren as? [[String: Any]] else {
                    throw ProtocolFailure("The screen contains malformed children.")
                }
                queue.append(contentsOf: children.map { ($0, depth + 1) })
            }
        }
        let envelope = try JSONDecoder().decode(ProfileEnvelope.self, from: data)
        try validate(envelope)
        return envelope
    }

    private final class JSONFrame {
        let isObject: Bool
        var keys = Set<String>()
        init(isObject: Bool) { self.isObject = isObject }
    }

    /// Foundation JSON parsers can choose different values for duplicate keys.
    /// Reject them before either parser sees the document, including escaped keys.
    /// This scanner only checks keys/nesting; JSONSerialization validates grammar.
    static func rejectAmbiguousJSON(_ data: Data) throws {
        let bytes = Array(data)
        var frames: [JSONFrame] = []
        var index = 0
        while index < bytes.count {
            switch bytes[index] {
            case 123, 91: // object / array
                guard frames.count < 100 else { throw ProtocolFailure("JSON nesting limit exceeded.") }
                frames.append(JSONFrame(isObject: bytes[index] == 123))
            case 125, 93:
                guard !frames.isEmpty else { throw ProtocolFailure("Malformed JSON response.") }
                frames.removeLast()
            case 34:
                let start = index
                index += 1
                var closed = false
                while index < bytes.count {
                    if bytes[index] == 92 { index += 2; continue }
                    if bytes[index] == 34 { closed = true; break }
                    index += 1
                }
                guard closed else { throw ProtocolFailure("Malformed JSON string.") }
                var next = index + 1
                while next < bytes.count && [UInt8(32), 9, 10, 13].contains(bytes[next]) { next += 1 }
                if next < bytes.count && bytes[next] == 58 {
                    guard let frame = frames.last, frame.isObject else {
                        throw ProtocolFailure("Malformed JSON object key.")
                    }
                    let key = try JSONDecoder().decode(String.self, from: Data(bytes[start...index]))
                    guard frame.keys.insert(key).inserted else { throw ProtocolFailure("Duplicate JSON object key: \(key).") }
                }
            default: break
            }
            index += 1
        }
    }

    public static func validate(_ envelope: ProfileEnvelope) throws {
        guard envelope.protocolVersion == NativeProtocol.version else {
            throw ProtocolFailure("This screen requires an unsupported protocol version.")
        }
        guard Set(envelope.requiredCapabilities).isSubset(of: Set(NativeProtocol.capabilities)) else {
            throw ProtocolFailure("This screen requires an unsupported native component.")
        }
        guard envelope.screenID == "profile", !envelope.screenRevision.isEmpty,
              !envelope.sessionID.isEmpty, !envelope.requestID.isEmpty,
              !envelope.csrfToken.isEmpty, envelope.dataVersion >= 0, envelope.dataVersion <= 9_007_199_254_740_991,
              !envelope.fields.isEmpty, envelope.fields.count <= 64,
              envelope.fields.keys.allSatisfy({ $0.range(of: "^[A-Za-z][A-Za-z0-9_]{0,63}\\z", options: .regularExpression) != nil }),
              envelope.fields.values.allSatisfy({ $0.utf8.count <= 16_384 }),
              Set(envelope.errors.keys).isSubset(of: Set(envelope.fields.keys)),
              Set(envelope.acknowledgedEdits.keys).isSubset(of: Set(envelope.fields.keys)),
              envelope.acknowledgedEdits.values.allSatisfy({ $0 >= 0 && $0 <= 9_007_199_254_740_991 }),
              envelope.status == .ready ? envelope.acknowledgedEdits.isEmpty : Set(envelope.acknowledgedEdits.keys) == Set(envelope.fields.keys),
              envelope.region.id == "profile-region", envelope.region.type == "region" else {
            throw ProtocolFailure("The server returned an invalid profile envelope.")
        }
        var ids = Set<String>()
        var inputs = Set<String>()
        var count = 0
        var forms = 0
        var submitButtons = 0
        func visit(_ node: NativeNode, depth: Int, form: String?) throws {
            count += 1
            guard depth <= NativeProtocol.maximumDepth, count <= NativeProtocol.maximumNodes,
                  node.id.range(of: "^[A-Za-z][A-Za-z0-9_-]{0,127}\\z", options: .regularExpression) != nil,
                  !node.id.hasPrefix("sdui-internal-"), ids.insert(node.id).inserted else {
                throw ProtocolFailure("The screen contains duplicate or invalid stable IDs, or exceeds its limits.")
            }
            guard NativeProtocol.capabilities.contains(node.type) else {
                throw ProtocolFailure("Unsupported native component: \(node.type).")
            }
            let structural = ["region", "form", "stack"].contains(node.type)
            guard structural || node.children.isEmpty else {
                throw ProtocolFailure("A native leaf component cannot contain children.")
            }
            guard node.type == "form" || node.events.isEmpty else {
                throw ProtocolFailure("The screen requests an unsupported native event.")
            }
            var childForm = form
            switch node.type {
            case "region":
                guard depth == 1 else { throw ProtocolFailure("Nested replacement regions are unsupported.") }
            case "form":
                forms += 1
                guard form == nil, node.id == "profile-form", node.events.count == 1,
                      node.events[0].on == "submit", node.events[0].action == "save-profile",
                      node.events[0].target == "profile-region" else {
                    throw ProtocolFailure("The screen requests an unregistered form action.")
                }
                childForm = node.id
            case "stack":
                guard ["column", "row"].contains(node.props.direction ?? "column"),
                      ["start", "center", "end", "stretch"].contains(node.props.align ?? "stretch"),
                      ["none", "xs", "sm", "md", "lg"].contains(node.props.gap ?? "md") else {
                    throw ProtocolFailure("The screen requests unsupported stack properties.")
                }
            case "input", "switch", "checkbox", "select":
                guard form == "profile-form", let name = node.props.name, envelope.fields[name] != nil,
                      node.props.label != nil, (node.props.type ?? "text") == "text",
                      node.props.multiple != true, inputs.insert(name).inserted else {
                    throw ProtocolFailure("The form contains an unsupported or duplicate field.")
                }
                if ["switch", "checkbox"].contains(node.type), (node.props.readonly == true || node.props.required == true || !["true", "false"].contains(envelope.fields[name] ?? "")) {
                    throw ProtocolFailure("A boolean field must contain true or false.")
                }
                if ["checkbox", "select"].contains(node.type) {
                    guard node.props.required == nil, node.props.readonly == nil, node.props.multiple == nil,
                          node.props.placeholder == nil, node.props.type == nil,
                          node.props.text == nil, node.props.title == nil, node.props.urgent == nil,
                          node.props.direction == nil, node.props.align == nil, node.props.gap == nil,
                          node.props.variant == nil, node.props.size == nil,
                          node.props.label?.isEmpty == false,
                          (node.props.label?.utf8.count ?? 0) <= 16_384,
                          (node.props.value?.utf8.count ?? 0) <= 16_384 else {
                        throw ProtocolFailure("Unsupported selection control properties.")
                    }
                    if node.type == "checkbox" {
                        guard node.props.options == nil else { throw ProtocolFailure("Checkbox options are unsupported.") }
                    } else {
                        guard node.props.checked == nil, let options = node.props.options,
                              (1...64).contains(options.count),
                              options.allSatisfy({ !$0.value.isEmpty && !$0.label.isEmpty && $0.value.utf8.count <= 16_384 && $0.label.utf8.count <= 16_384 }),
                              Set(options.map(\.value)).count == options.count,
                              options.contains(where: { $0.value == envelope.fields[name] }) else {
                            throw ProtocolFailure("A select requires unique bounded options and a matching field value.")
                        }
                    }
                }
            case "button":
                submitButtons += 1
                guard form == "profile-form", node.props.label != nil,
                      node.props.type == "submit",
                      ["default", "primary", "secondary", "outline", "ghost", "destructive"].contains(node.props.variant ?? "default"),
                      ["default", "xs", "sm", "lg"].contains(node.props.size ?? "default") else {
                    throw ProtocolFailure("Only the registered form submit button is supported.")
                }
            case "text", "notice":
                guard node.props.text != nil else { throw ProtocolFailure("A text component is missing its text.") }
            default: break
            }
            for child in node.children { try visit(child, depth: depth + 1, form: childForm) }
        }
        try visit(envelope.region, depth: 1, form: nil)
        guard forms == 1, submitButtons > 0, inputs == Set(envelope.fields.keys) else {
            throw ProtocolFailure("The screen must contain its registered form and exactly one control per field.")
        }
    }
}
