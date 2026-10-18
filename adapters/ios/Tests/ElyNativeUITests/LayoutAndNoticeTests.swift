#if os(iOS)
import XCTest
import SwiftUI
import UIKit
import ElyNativeCore
@testable import ElyNativeUI

@MainActor
final class LayoutAndNoticeTests: XCTestCase {
    private func node(_ props: String = "") throws -> NativeNode {
        try JSONDecoder().decode(NativeNode.self, from: Data("""
        {"id":"stack","type":"stack","props":{\(props)},"children":[
          {"id":"short","type":"text","props":{"text":"Short"}},
          {"id":"long","type":"text","props":{"text":"Longer text"}}
        ]}
        """.utf8))
    }

    private func host<Content: View>(_ content: Content, width: CGFloat = 320) -> UIHostingController<Content> {
        let host = UIHostingController(rootView: content)
        // A detached hosting view does not mount SwiftUI's render graph on iOS.
        // Retain a real window through teardown so layout, preferences and onChange run.
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: width, height: 480))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        window.setNeedsLayout()
        window.layoutIfNeeded()
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        addTeardownBlock {
            await MainActor.run {
                window.isHidden = true
                window.rootViewController = nil
            }
        }
        return host
    }

    private func waitUntil(_ description: String, condition: () -> Bool, file: StaticString = #filePath, line: UInt = #line) {
        let deadline = Date().addingTimeInterval(3)
        while !condition() && Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.01))
        }
        XCTAssertTrue(condition(), description, file: file, line: line)
    }

    func testColumnDefaultStretchAndCrossAxisAlignments() throws {
        for align in ["stretch", "start", "center", "end"] {
            let first = ProbeUIView(size: CGSize(width: 40, height: 20))
            let second = ProbeUIView(size: CGSize(width: 100, height: 40))
            let stack = try node(align == "stretch" ? "" : "\"align\":\"\(align)\"")
            let controller = host(NativeStack(node: stack) { item in
                Probe(view: item.id == "short" ? first : second)
            })
            waitUntil("Mounted native probes must receive layout") { first.bounds.width > 0 && second.bounds.width > 0 }
            let a = first.convert(first.bounds, to: controller.view)
            let b = second.convert(second.bounds, to: controller.view)
            XCTAssertEqual(b.minY - a.maxY, 16, accuracy: 1)
            if align == "stretch" {
                XCTAssertEqual(a.width, 320, accuracy: 1)
                XCTAssertEqual(b.width, 320, accuracy: 1)
            } else {
                XCTAssertEqual(a.width, 40, accuracy: 1)
                XCTAssertEqual(b.width, 100, accuracy: 1)
                if align == "start" { XCTAssertEqual(a.minX, b.minX, accuracy: 1) }
                if align == "center" { XCTAssertEqual(a.midX, b.midX, accuracy: 1) }
                if align == "end" { XCTAssertEqual(a.maxX, b.maxX, accuracy: 1) }
            }
        }
    }

    func testRowStretchUsesTallestChildAndKeepsIntrinsicWidths() throws {
        let first = ProbeUIView(size: CGSize(width: 40, height: 20))
        let second = ProbeUIView(size: CGSize(width: 100, height: 40))
        let stack = try node("\"direction\":\"row\",\"gap\":\"sm\"")
        let controller = host(NativeStack(node: stack) { item in Probe(view: item.id == "short" ? first : second) })
        waitUntil("Mounted row probes must receive layout") { first.bounds.width > 0 && second.bounds.width > 0 }
        let a = first.convert(first.bounds, to: controller.view)
        let b = second.convert(second.bounds, to: controller.view)
        XCTAssertEqual(a.width, 40, accuracy: 1)
        XCTAssertEqual(b.width, 100, accuracy: 1)
        XCTAssertEqual(a.height, 40, accuracy: 1)
        XCTAssertEqual(b.height, 40, accuracy: 1)
        XCTAssertEqual(b.minX - a.maxX, 8, accuracy: 1)
    }

    func testRealTextContainersStretchWithoutEqualRowWidths() {
        for row in [false, true] {
            var frames: [String: CGRect] = [:]
            let controller = host(NativeStackLayout(row: row, align: "stretch", spacing: 8) {
                ForEach(["short", "long"], id: \.self) { id in
                    NativeStackItem(row: row, stretch: true) {
                        Text(id == "short" ? "Short" : "Longer text\nSecond line")
                    }
                    .background(GeometryReader { geometry in
                        Color.clear.preference(key: FrameKey.self, value: [id: geometry.frame(in: .named("stack"))])
                    })
                }
            }.coordinateSpace(name: "stack").onPreferenceChange(FrameKey.self) { frames = $0 })
            controller.view.layoutIfNeeded()
            waitUntil("Mounted text containers must publish geometry") { frames.count == 2 }
            guard let a = frames["short"], let b = frames["long"] else {
                XCTFail("Native text container geometry was not measured"); continue
            }
            if row {
                XCTAssertEqual(a.height, b.height, accuracy: 1)
                XCTAssertGreaterThan(a.height, 25)
                XCTAssertLessThan(a.width, b.width)
                XCTAssertEqual(b.minX - a.maxX, 8, accuracy: 1)
            } else {
                XCTAssertEqual(a.width, 320, accuracy: 1)
                XCTAssertEqual(b.width, 320, accuracy: 1)
                XCTAssertEqual(b.minY - a.maxY, 8, accuracy: 1)
            }
        }
    }

    func testNestedConstrainedRowsWithRTLAndAccessibilityText() throws {
        let nested = try node("\"gap\":\"none\"")
        for direction in [LayoutDirection.leftToRight, .rightToLeft] {
            for width in [CGFloat(120), CGFloat(320)] {
                var frames: [String: CGRect] = [:]
                let controller = host(NativeStackLayout(row: true, align: "stretch", spacing: 8) {
                    NativeStackItem(row: true, stretch: true) {
                        NativeStack(node: nested) { item in Text(item.props.text ?? "") }
                    }.background(GeometryReader { geometry in
                        Color.clear.preference(key: FrameKey.self, value: ["nested": geometry.frame(in: .named("stack"))])
                    })
                    NativeStackItem(row: true, stretch: true) {
                        Text("Tall\nside\ntext")
                    }.background(GeometryReader { geometry in
                        Color.clear.preference(key: FrameKey.self, value: ["side": geometry.frame(in: .named("stack"))])
                    })
                }
                .coordinateSpace(name: "stack")
                .onPreferenceChange(FrameKey.self) { frames = $0 }
                .environment(\.layoutDirection, direction)
                .environment(\.dynamicTypeSize, .accessibility3), width: width)
                controller.view.layoutIfNeeded()
                waitUntil("Mounted nested stack must publish geometry") { frames.count == 2 }
                guard let a = frames["nested"], let b = frames["side"] else {
                    XCTFail("Nested stack geometry was not measured"); continue
                }
                XCTAssertEqual(a.height, b.height, accuracy: 1)
                XCTAssertGreaterThan(a.height, 0)
                XCTAssertGreaterThan(a.width, 0)
                XCTAssertGreaterThan(b.width, 0)
                XCTAssertTrue(a.width.isFinite && a.height.isFinite)
                XCTAssertGreaterThanOrEqual(min(a.minX, b.minX), -1)
                XCTAssertLessThanOrEqual(max(a.maxX, b.maxX), width + 1)
                if direction == .leftToRight { XCTAssertEqual(b.minX - a.maxX, 8, accuracy: 1) }
                else { XCTAssertEqual(a.minX - b.maxX, 8, accuracy: 1) }
            }
        }
    }

    func testNoticeAnnouncementPriorityAndContentChanges() throws {
        var notice = try JSONDecoder().decode(NativeNode.self, from: Data("""
        {"id":"notice","type":"notice","props":{"title":"Warning","text":"Check your details.","urgent":true}}
        """.utf8))
        var announcements: [NSAttributedString] = []
        let recorder: (NSAttributedString) -> Void = { announcements.append($0) }
        let controller = host(NativeNotice(node: notice, announce: recorder))
        waitUntil("Mounted notice must announce its initial content") { announcements.count >= 1 }
        XCTAssertEqual(announcements.map(\.string), ["Warning. Check your details."])
        let key = NSAttributedString.Key.accessibilitySpeechQueueAnnouncement
        XCTAssertEqual(announcements.first?.attribute(key, at: 0, effectiveRange: nil) as? Bool, false)
        controller.rootView = NativeNotice(node: notice, announce: recorder)
        controller.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        XCTAssertEqual(announcements.count, 1, "Unchanged region replacement must not announce again")
        notice.props.text = "Details checked."
        notice.props.urgent = false
        controller.rootView = NativeNotice(node: notice, announce: recorder)
        controller.view.layoutIfNeeded()
        waitUntil("Changed notice text must announce") { announcements.count >= 2 }
        XCTAssertEqual(announcements.map(\.string), ["Warning. Check your details.", "Warning. Details checked."])
        XCTAssertEqual(announcements.last?.attribute(key, at: 0, effectiveRange: nil) as? Bool, true)
        notice.props.title = "Finished"
        controller.rootView = NativeNotice(node: notice, announce: recorder)
        controller.view.layoutIfNeeded()
        waitUntil("Notice update must announce") { announcements.count >= 3 }
        XCTAssertEqual(announcements.count, 3, "Title-only changes announce")
        XCTAssertEqual(announcements.last?.string, "Finished. Details checked.")
        notice.props.urgent = true
        controller.rootView = NativeNotice(node: notice, announce: recorder)
        controller.view.layoutIfNeeded()
        waitUntil("Notice update must announce") { announcements.count >= 4 }
        XCTAssertEqual(announcements.count, 4, "Urgency-only changes announce")
        XCTAssertEqual(announcements.last?.attribute(key, at: 0, effectiveRange: nil) as? Bool, false)
        let remounted = host(NativeNotice(node: notice, announce: recorder))
        remounted.view.layoutIfNeeded()
        waitUntil("Notice update must announce") { announcements.count >= 5 }
        XCTAssertEqual(announcements.count, 5, "A genuinely new mount announces again")
    }
}

private struct FrameKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private final class ProbeUIView: UIView {
    let naturalSize: CGSize
    init(size: CGSize) { naturalSize = size; super.init(frame: .zero) }
    required init?(coder: NSCoder) { fatalError("Not used") }
    override var intrinsicContentSize: CGSize { naturalSize }
}
private struct Probe: UIViewRepresentable {
    let view: ProbeUIView
    func makeUIView(context: Context) -> ProbeUIView { view }
    func updateUIView(_ uiView: ProbeUIView, context: Context) {}
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: ProbeUIView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? uiView.naturalSize.width, height: proposal.height ?? uiView.naturalSize.height)
    }
}
#endif
