Pod::Spec.new do |s|
  s.name           = 'ShowController'
  s.version        = '0.1.0'
  s.summary        = 'Native show-controller bridge'
  s.description    = 'Normalizes raw generic and Flic 2 input with queued-event suppression and health reporting.'
  s.author         = 'Show Control contributors'
  s.homepage       = 'https://example.invalid/show-control'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ShowAudio'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.public_header_files = 'ShowControllerFlicBridge.h'
  s.frameworks = 'CoreBluetooth', 'GameController', 'UIKit'

  # Fetch the official v1.4.1 repository (Swift Package/XCFramework) into Vendor before pod install.
  # The bridge deliberately compiles as unavailable when the licensed binary has not been supplied.
  binary = File.join(__dir__, 'Vendor', 'flic2lib.xcframework')
  s.vendored_frameworks = 'Vendor/flic2lib.xcframework' if File.exist?(binary)
end
