import SwiftUI
import ElyNativeCore
import ElyNativeUI

@main
@MainActor
struct ElyProfileApp: App {
    private let transport: Result<any ProfileTransport, Error>
    #if DEBUG
    private let selectionControl: SelectionUITestControl?
    #endif

    init() {
        #if DEBUG
        let scenario = SelectionUITestTransport.Scenario.optedIn(
            arguments: ProcessInfo.processInfo.arguments, environment: ProcessInfo.processInfo.environment)
        let control = scenario == .interruptedSave ? SelectionUITestControl() : nil
        selectionControl = control
        #endif
        transport = Result {
            var origin = Bundle.main.object(forInfoDictionaryKey: "ElyAPIBaseURL") as? String ?? ""
            #if DEBUG
            if let override = ProcessInfo.processInfo.environment["ELY_API_BASE_URL"] { origin = override }
            let allowLocalHTTP = true
            #else
            let allowLocalHTTP = false
            #endif
            guard let url = URL(string: origin), !origin.isEmpty else {
                throw ProtocolFailure("Set ELY_API_BASE_URL to your HTTPS API origin in the Release build configuration.")
            }
            #if DEBUG
            // UI tests opt in explicitly; never bundle fixtures or replace the Go backend.
            if let scenario {
                let live = try HTTPProfileTransport(baseURL: url, allowLocalHTTP: allowLocalHTTP, configuration: .ephemeral)
                return SelectionUITestTransport(live: live, scenario: scenario, gate: control?.gate)
            }
            #endif
            return try HTTPProfileTransport(baseURL: url, allowLocalHTTP: allowLocalHTTP)
        }
    }

    var body: some Scene {
        WindowGroup {
            switch transport {
            #if DEBUG
            case .success(let transport): ProfileAppContent(transport: transport, selectionControl: selectionControl)
            #else
            case .success(let transport): ProfileAppContent(transport: transport)
            #endif
            case .failure(let error):
                ContentUnavailableView("API configuration required", systemImage: "network", description: Text(error.localizedDescription))
            }
        }
    }
}

@MainActor
private struct ProfileAppContent: View {
    @StateObject private var model: ProfileViewModel
    #if DEBUG
    private let selectionControl: SelectionUITestControl?
    init(transport: any ProfileTransport, selectionControl: SelectionUITestControl?) {
        _model = StateObject(wrappedValue: ProfileViewModel(transport: transport))
        self.selectionControl = selectionControl
    }
    #else
    init(transport: any ProfileTransport) {
        _model = StateObject(wrappedValue: ProfileViewModel(transport: transport))
    }
    #endif

    var body: some View {
        #if DEBUG
        if let selectionControl {
            NativeProfileView(model: model)
                .safeAreaInset(edge: .bottom) {
                    SelectionUITestPanel(control: selectionControl, model: model)
                }
                .onDisappear { selectionControl.gate.tearDown() }
        } else {
            NativeProfileView(model: model)
        }
        #else
        NativeProfileView(model: model)
        #endif
    }
}

#if DEBUG
@MainActor
private final class SelectionUITestControl: ObservableObject {
    let gate = SelectionSaveGate()
    @Published private(set) var state: SelectionSaveGate.State = .idle

    init() {
        gate.stateChanged = { [weak self] state in self?.state = state }
    }
}

@MainActor
private struct SelectionUITestPanel: View {
    @ObservedObject var control: SelectionUITestControl
    @ObservedObject var model: ProfileViewModel

    private var marker: String {
        // Phase and pending ID are the actual model, never inferred from the gate or Save button.
        let phase: String
        switch model.state.phase {
        case .idle: phase = "idle"
        case .sending: phase = "sending"
        case .retryable: phase = "retryable"
        case .blocked: phase = "blocked"
        }
        var value = "gate=\(control.state.name);request=\(control.state.requestID ?? "none");phase=\(phase);pending=\(model.state.pending?.requestID ?? "none")"
        if case .failed(_, let reason) = control.state { value += ";failure=\(reason)" }
        return value
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(marker).font(.caption2)
                .accessibilityIdentifier("selection-save-state")
            if case .held(let requestID) = control.state {
                Button("Release interrupted save") {
                    control.gate.release(requestID: requestID, phase: model.state.phase,
                                         pendingRequestID: model.state.pending?.requestID)
                }
                .accessibilityIdentifier("selection-save-release-\(requestID)")
            }
        }
        .padding(6)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial)
    }
}
#endif
