#if os(iOS)
import ElyNativeCore
import SwiftUI
import UIKit

/// Stretch fills the cross axis, without imposing equal widths on row children.
struct NativeStack<Child: View>: View {
    let node: NativeNode
    @ViewBuilder var child: (NativeNode) -> Child

    private var spacing: CGFloat {
        ["none": 0, "xs": 4, "sm": 8, "md": 16, "lg": 24][node.props.gap ?? "md"] ?? 16
    }
    var body: some View {
        NativeStackLayout(row: node.props.direction == "row", align: node.props.align ?? "stretch", spacing: spacing) {
            ForEach(node.children) { item in
                NativeStackItem(row: node.props.direction == "row", stretch: (node.props.align ?? "stretch") == "stretch") {
                    child(item)
                }
            }
        }
    }
}

/// Fixed-size leaves such as Text need an expanding container to accept stretch.
struct NativeStackItem<Content: View>: View {
    let row: Bool
    let stretch: Bool
    @ViewBuilder var content: () -> Content
    var body: some View {
        content().frame(maxWidth: !row && stretch ? .infinity : nil,
                        maxHeight: row && stretch ? .infinity : nil, alignment: .topLeading)
    }
}

/// Measure natural main-axis sizes, shrinking rows only when space is constrained.
/// Cross-axis stretch is applied in placement, after the tallest child is known.
struct NativeStackLayout: Layout {
    let row: Bool
    let align: String
    let spacing: CGFloat

    private func sizes(_ proposal: ProposedViewSize, _ subviews: Subviews) -> [CGSize] {
        let proposedWidth = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
        let natural = subviews.map { $0.sizeThatFits(.unspecified) }
        if row {
            let available = max(0, (proposedWidth ?? .infinity) - spacing * CGFloat(max(0, subviews.count - 1)))
            let total = natural.reduce(CGFloat(0)) { $0 + $1.width }
            let scale = total > available && total > 0 ? available / total : 1
            return zip(subviews, natural).map { view, size in
                view.sizeThatFits(ProposedViewSize(width: size.width * scale, height: nil))
            }
        }
        return zip(subviews, natural).map { view, size in
            let width = align == "stretch" ? proposedWidth : proposedWidth.map { min($0, size.width) }
            return view.sizeThatFits(ProposedViewSize(width: width, height: nil))
        }
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let measured = sizes(proposal, subviews)
        let gaps = spacing * CGFloat(max(0, measured.count - 1))
        let proposedWidth = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
        return CGSize(width: proposedWidth ?? (row ? measured.reduce(0) { $0 + $1.width } + gaps : measured.map(\.width).max() ?? 0),
                      height: row ? measured.map(\.height).max() ?? 0 : measured.reduce(0) { $0 + $1.height } + gaps)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let measured = sizes(ProposedViewSize(width: bounds.width, height: nil), subviews)
        var cursor = row ? bounds.minX : bounds.minY
        for (view, size) in zip(subviews, measured) {
            let cross = row ? bounds.height : bounds.width
            let naturalCross = row ? size.height : size.width
            let offset = align == "end" ? cross - naturalCross : align == "center" ? (cross - naturalCross) / 2 : 0
            let width = !row && align == "stretch" ? bounds.width : size.width
            let height = row && align == "stretch" ? bounds.height : size.height
            view.place(at: CGPoint(x: row ? cursor : bounds.minX + offset, y: row ? bounds.minY + offset : cursor),
                       anchor: .topLeading, proposal: ProposedViewSize(width: width, height: height))
            cursor += (row ? size.width : size.height) + spacing
        }
    }
}

/// A stable notice announces on insertion and when its content/urgency changes.
/// Unrelated state refreshes do not repeat the announcement.
struct NativeNotice: View {
    let node: NativeNode
    var announce: (NSAttributedString) -> Void = {
        UIAccessibility.post(notification: .announcement, argument: $0)
    }
    private var content: String {
        [node.props.title, node.props.text].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ". ")
    }
    private var urgent: Bool { node.props.urgent == true }
    private var announcement: NoticeAnnouncement { NoticeAnnouncement(text: content, urgent: urgent) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title = node.props.title, !title.isEmpty { Text(title).font(.headline) }
            Text(node.props.text ?? "")
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background((urgent ? Color.orange : Color.blue).opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content)
        .accessibilityIdentifier(node.id)
        .onChange(of: announcement, initial: true) { _, value in
            guard !value.text.isEmpty else { return }
            announce(value.attributedString)
        }
    }
}

struct NoticeAnnouncement: Equatable {
    let text: String
    let urgent: Bool
    var attributedString: NSAttributedString {
        NSAttributedString(string: text, attributes: [
            NSAttributedString.Key.accessibilitySpeechQueueAnnouncement: !urgent
        ])
    }
}
#endif
