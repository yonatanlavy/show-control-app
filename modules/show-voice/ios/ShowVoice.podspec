Pod::Spec.new do |s|
  s.name = 'ShowVoice'
  s.version = '0.2.0'
  s.summary = 'Local offline performer phrase recognition'
  s.description = 'Uses pinned whisper.cpp and native microphone capture; no cloud or live JavaScript timing.'
  s.author = 'Show Control contributors'
  s.homepage = 'https://example.invalid/show-control'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{h,mm,swift}'
  s.public_header_files = 'ShowWhisperBridge.h'
  s.vendored_frameworks = '../vendor/whisper.cpp/build-apple/whisper.xcframework'
  s.frameworks = 'AVFoundation', 'Accelerate', 'Metal'
  s.libraries = 'c++'
  s.pod_target_xcconfig = { 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17', 'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/../vendor/whisper.cpp/include"' }
end
