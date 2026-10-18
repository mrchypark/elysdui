import ElyNativeCore

#if os(iOS)
import SwiftUI
import UIKit

@MainActor
public final class ProfileViewModel: ObservableObject {
    @Published public private(set) var state = ProfileState()
    @Published fileprivate var composingIDs = Set<String>()
    private let transport: any ProfileTransport
    public init(transport: any ProfileTransport) { self.transport = transport }

    public func loadIfNeeded() {
        guard state.envelope == nil, state.pending == nil else { return }
        do { send(try state.beginLoad()) } catch { assertionFailure(error.localizedDescription) }
    }
    public func reloadDiscardingDrafts() {
        // Old completions are ignored by request ID, including a previous session.
        composingIDs.removeAll()
        do { send(try state.beginLoad(discardingDrafts: true)) } catch { assertionFailure(error.localizedDescription) }
    }
    public func save() {
        guard composingIDs.isEmpty, state.canSave else { return }
        do { send(try state.beginSave()) } catch { assertionFailure(error.localizedDescription) }
    }
    public func retry() {
        guard composingIDs.isEmpty else { return }
        do { send(try state.retry()) } catch { assertionFailure(error.localizedDescription) }
    }
    public func edit(field: String, value: String) { state.edit(field: field, value: value) }

    private func send(_ request: PendingRequest) {
        Task {
            do {
                let response = try await transport.send(request)
                let result = try state.receive(response)
                if result == .ignored {
                    state.fail(requestID: request.requestID, message: "An outdated response was ignored. Retry the current request.", retryable: true)
                }
            } catch let failure as TransportFailure {
                state.fail(requestID: request.requestID, message: failure.message, retryable: failure.retryable)
            } catch {
                state.fail(requestID: request.requestID,
                           message: "This screen could not be loaded safely. \(error.localizedDescription)", retryable: false)
            }
        }
    }
}

@MainActor
public struct NativeProfileView: View {
    @ObservedObject private var model: ProfileViewModel
    @State private var confirmReload = false
    @State private var focusedNodeID: String?

    public init(model: ProfileViewModel) { self.model = model }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let message = model.state.failureMessage {
                        VStack(alignment: .leading, spacing: 10) {
                            Label(model.state.phase == .blocked ? "Screen unavailable" : "Connection interrupted", systemImage: "exclamationmark.triangle")
                                .font(.headline)
                            Text(message).accessibilityIdentifier("transport-error")
                            if model.state.phase == .retryable {
                                Button("Retry same request", action: model.retry)
                                    .disabled(!model.composingIDs.isEmpty)
                                    .accessibilityIdentifier("retry-request")
                            }
                            if model.state.phase == .blocked {
                                Text("Your edits are still here. Reloading will discard local edits and load the latest profile.")
                                Button("Reload profile…") {
                                    focusedNodeID = nil
                                    confirmReload = true
                                }
                                    .accessibilityIdentifier("reload-error")
                            }
                        }
                        .padding().frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityElement(children: .contain)
                    }
                    if let envelope = model.state.envelope {
                        NativeNodeView(node: envelope.region, model: model, focusedNodeID: $focusedNodeID)
                        if !model.state.statusMessage.isEmpty {
                            Text(model.state.statusMessage)
                                .font(.callout).foregroundStyle(.secondary)
                                .accessibilityIdentifier("profile-status")
                        }
                        if model.state.hasUnsavedChanges {
                            Text("You have unsaved changes.")
                                .font(.caption).foregroundStyle(.secondary)
                                .accessibilityIdentifier("unsaved-changes")
                        }
                    } else if model.state.isSending {
                        ProgressView("Loading profile…").frame(maxWidth: .infinity)
                            .accessibilityIdentifier("profile-loading")
                    }
                }
                .padding(24)
                .frame(maxWidth: 600, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("elysdui Profile")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Reload") {
                        focusedNodeID = nil
                        confirmReload = true
                    }
                        .disabled(model.state.isSending)
                        .accessibilityIdentifier("reload-profile")
                }
            }
            .alert("Reload and discard local edits?", isPresented: $confirmReload) {
                Button("Discard edits and reload", role: .destructive) {
                    focusedNodeID = nil
                    model.reloadDiscardingDrafts()
                }
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text("This loads the current server profile and discards all unsaved edits. A save that already reached the server may still have completed.")
            }
        }
        .task { model.loadIfNeeded() }
        .onChange(of: model.state.fieldErrors) { _, errors in
            if let error = errors.keys.sorted().compactMap({ errors[$0] }).first {
                UIAccessibility.post(notification: .announcement, argument: error)
            }
        }
        .onChange(of: model.state.statusMessage) { _, message in
            if !message.isEmpty { UIAccessibility.post(notification: .announcement, argument: message) }
        }
        .onChange(of: model.state.failureMessage) { _, message in
            if let message { UIAccessibility.post(notification: .announcement, argument: message) }
        }
    }
}

@MainActor
private struct NativeNodeView: View {
    let node: NativeNode
    @ObservedObject var model: ProfileViewModel
    @Binding var focusedNodeID: String?

    var body: some View { rendered.id(node.id) }

    private var children: some View {
        ForEach(node.children) { child in
            NativeNodeView(node: child, model: model, focusedNodeID: $focusedNodeID)
        }
    }
    private var controlSize: ControlSize {
        switch node.props.size {
        case "xs": return .mini
        case "sm": return .small
        case "lg": return .large
        default: return .regular
        }
    }
    // Type erasure bounds SwiftUI's recursive generic view type. This does not interpret code.
    private var rendered: AnyView {
        switch node.type {
        case "region", "form":
            return AnyView(VStack(alignment: .leading, spacing: 16) {
                if let label = node.props.label, !label.isEmpty {
                    Text(label).font(node.type == "region" ? .title2.bold() : .headline)
                        .accessibilityAddTraits(.isHeader)
                }
                children
            }.frame(maxWidth: .infinity, alignment: .leading))
        case "stack":
            return AnyView(NativeStack(node: node) { child in
                NativeNodeView(node: child, model: model, focusedNodeID: $focusedNodeID)
            })
        case "text":
            return AnyView(Text(node.props.text ?? "").fixedSize(horizontal: false, vertical: true))
        case "notice":
            return AnyView(NativeNotice(node: node))
        case "input":
            let name = node.props.name ?? "displayName"
            let error = model.state.fieldErrors[name]
            return AnyView(VStack(alignment: .leading, spacing: 6) {
                Text(node.props.label ?? name).font(.subheadline.weight(.semibold))
                CompositionTextField(
                    value: Binding(get: { model.state.drafts[name] ?? "" }, set: { model.edit(field: name, value: $0) }),
                    focusedNodeID: $focusedNodeID, nodeID: node.id,
                    fieldName: name, label: node.props.label ?? name, placeholder: node.props.placeholder ?? "",
                    editable: node.props.disabled != true && node.props.readonly != true && !model.state.isLoading,
                    error: error,
                    compositionChanged: { composing in
                        if composing { model.composingIDs.insert(node.id) }
                        else { model.composingIDs.remove(node.id) }
                    }
                )
                .frame(minHeight: 44)
                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.callout).foregroundStyle(.red)
                        .accessibilityIdentifier("error-\(name)")
                }
            })
        case "switch":
            let name = node.props.name ?? ""
            return AnyView(VStack(alignment: .leading, spacing: 6) {
                Toggle(node.props.label ?? name, isOn: Binding(
                    get: { model.state.drafts[name] == "true" },
                    set: { model.edit(field: name, value: $0 ? "true" : "false") }))
                    .disabled(node.props.disabled == true || !model.state.drafts.keys.contains(name) || model.state.isLoading)
                    .accessibilityIdentifier(node.id)
                if let error = model.state.fieldErrors[name] {
                    Text(error).foregroundStyle(.red).accessibilityIdentifier("error-\(name)")
                }
            })
        case "checkbox":
            let name = node.props.name ?? ""
            return AnyView(VStack(alignment: .leading, spacing: 6) {
                Toggle(node.props.label ?? name, isOn: Binding(
                    get: { model.state.drafts[name] == "true" },
                    set: { model.edit(field: name, value: $0 ? "true" : "false") }))
                    .toggleStyle(NativeCheckboxStyle())
                    .disabled(node.props.disabled == true || !model.state.drafts.keys.contains(name) || model.state.isLoading)
                    .accessibilityIdentifier(node.id)
                if let error = model.state.fieldErrors[name] {
                    Text(error).foregroundStyle(.red).accessibilityIdentifier("error-\(name)")
                }
            })
        case "select":
            let name = node.props.name ?? ""
            return AnyView(VStack(alignment: .leading, spacing: 6) {
                // Menu Picker can show only the selected value visually on iOS.
                // Keep its native accessible label while adding a visible field title.
                Text(node.props.label ?? name)
                    .font(.subheadline.weight(.semibold))
                    .accessibilityHidden(true)
                Picker(node.props.label ?? name, selection: Binding(
                    get: { model.state.drafts[name] ?? "" },
                    set: { model.edit(field: name, value: $0) })) {
                    ForEach(node.props.options ?? [], id: \.value) { option in
                        Text(option.label).tag(option.value)
                    }
                }
                .pickerStyle(.menu)
                .disabled(node.props.disabled == true || !model.state.drafts.keys.contains(name) || model.state.isLoading)
                .accessibilityIdentifier(node.id)
                if let error = model.state.fieldErrors[name] {
                    Text(error).foregroundStyle(.red).accessibilityIdentifier("error-\(name)")
                }
            })
        case "button":
            let button = Button(action: model.save) {
                HStack {
                    if model.state.isSending { ProgressView().tint(.white) }
                    Text(model.state.isSending ? "Saving…" : (node.props.label ?? "Save"))
                }.frame(minHeight: 32).frame(maxWidth: .infinity)
            }
                .controlSize(controlSize)
                .tint(node.props.variant == "destructive" ? Color.red : Color.accentColor)
                .disabled(!model.state.canSave || node.props.disabled == true || !model.composingIDs.isEmpty)
                .accessibilityIdentifier("save-profile")
            switch node.props.variant {
            case "ghost": return AnyView(button.buttonStyle(.plain))
            case "outline", "secondary": return AnyView(button.buttonStyle(.bordered))
            default: return AnyView(button.buttonStyle(.borderedProminent))
            }
        default:
            // Validation normally prevents this branch. Never fall back to HTML or a web view.
            return AnyView(Label("This component is not supported.", systemImage: "exclamationmark.triangle"))
        }
    }
}

/// SwiftUI has no built-in checkbox style on iOS. Keep Toggle's native binding
/// and an accessible, keyboard-activatable button with explicit checked state.
@MainActor
private struct NativeCheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 10) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .imageScale(.large).accessibilityHidden(true)
                configuration.label
            }
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(configuration.isOn ? "Checked" : "Unchecked")
        .accessibilityHint("Double-tap to change. Changes are saved when you choose Save.")
    }
}

/// A native UITextField inside SwiftUI exposes marked-text state reliably. IME
/// composition is local-only; it cannot trigger a save or overwrite a draft.
@MainActor
private struct CompositionTextField: UIViewRepresentable {
    @Binding var value: String
    @Binding var focusedNodeID: String?
    let nodeID: String
    let fieldName: String
    let label: String
    let placeholder: String
    let editable: Bool
    let error: String?
    let compositionChanged: (Bool) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.delegate = context.coordinator
        field.borderStyle = .roundedRect
        field.font = .preferredFont(forTextStyle: .body)
        field.adjustsFontForContentSizeCategory = true
        field.autocapitalizationType = .words
        field.returnKeyType = .done
        field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return field
    }
    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
        if field.markedTextRange == nil && field.text != value { field.text = value }
        field.placeholder = placeholder
        field.accessibilityLabel = label
        field.accessibilityHint = error ?? "Changes are saved only when you choose Save."
        field.accessibilityIdentifier = "input-\(fieldName)"
        field.isEnabled = editable
        // No identity is tied to screen/data revisions. The native field survives replacement.
        if focusedNodeID == nodeID && editable && !field.isFirstResponder { field.becomeFirstResponder() }
        if focusedNodeID != nodeID && field.isFirstResponder { field.resignFirstResponder() }
    }
    @MainActor
    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: CompositionTextField
        init(_ parent: CompositionTextField) { self.parent = parent }
        @objc func changed(_ field: UITextField) {
            let composing = field.markedTextRange != nil
            parent.compositionChanged(composing)
            if !composing { parent.value = field.text ?? "" }
        }
        func textFieldDidBeginEditing(_ textField: UITextField) { parent.focusedNodeID = parent.nodeID }
        func textFieldDidEndEditing(_ textField: UITextField) {
            // Clear requested focus before publishing changes that can refresh SwiftUI.
            // Otherwise updateUIView can restore focus while UIKit is resigning it.
            if parent.focusedNodeID == parent.nodeID { parent.focusedNodeID = nil }
            parent.compositionChanged(false)
            parent.value = textField.text ?? ""
        }
        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            // Return commits/dismisses the input; only the explicit button invokes a request.
            guard textField.markedTextRange == nil else { return false }
            // Intentional dismissal must precede UIKit's didEnd callbacks. Save
            // responses never clear this binding, preserving focus across replacements.
            parent.focusedNodeID = nil
            textField.resignFirstResponder()
            return true
        }
    }
}
#else
/// Core tests compile on Linux; the actual native UI requires the iOS SDK.
public enum ElyNativeUIAvailability {}
#endif
