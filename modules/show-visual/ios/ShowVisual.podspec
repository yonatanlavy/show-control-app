Pod::Spec.new do |s|
  s.name = 'ShowVisual'
  s.version = '0.2.0'
  s.summary = 'Independent audience-only local visual output'
  s.description = 'Renders image/video cues on a dedicated external display without exposing operator UI.'
  s.author = 'Show Control contributors'
  s.homepage = 'https://example.invalid/show-control'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.dependency 'ShowAudio'
  s.source_files = '**/*.swift'
  s.frameworks = 'AVFoundation', 'UIKit', 'ImageIO'
end
