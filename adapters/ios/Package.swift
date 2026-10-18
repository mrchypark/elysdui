// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ElyNative",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "ElyNativeCore", targets: ["ElyNativeCore"]),
        .library(name: "ElyNativeUI", targets: ["ElyNativeUI"])
    ],
    targets: [
        .target(name: "ElyNativeCore"),
        .target(name: "ElyNativeUI", dependencies: ["ElyNativeCore"]),
        .testTarget(name: "ElyNativeCoreTests", dependencies: ["ElyNativeCore"]),
        // App-only DEBUG support is tested from the exact source compiled by Xcode.
        // It is deliberately not a product or a dependency of either shipping library.
        .target(name: "SelectionUITestSupport", dependencies: ["ElyNativeCore"],
                path: "App/SelectionUITestSupport"),
        .testTarget(name: "SelectionUITestSupportTests", dependencies: ["ElyNativeCore", "SelectionUITestSupport"])
    ]
)
