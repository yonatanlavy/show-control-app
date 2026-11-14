# Flic 2 iOS binary seam

Place `flic2lib.xcframework` from the official
`https://github.com/50ButtonsEach/flic2lib-ios` tag `v1.4.1` in this directory before running
`pod install`. The upstream repository is also a Swift Package with the same binary target.

The module intentionally builds with `sdkAvailable: false` when the licensed XCFramework is absent.
Initial pairing can require internet access for verification or firmware work; normal paired-button
operation must be tested offline on real devices before release.
