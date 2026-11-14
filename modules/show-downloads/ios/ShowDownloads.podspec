Pod::Spec.new do |s|
  s.name = 'ShowDownloads'
  s.version = '0.1.0'
  s.summary = 'Background transfer of prepared music from an owner-paired helper'
  s.description = 'Stores bounded background URLSession downloads on this device, without playback access.'
  s.author = 'Show Control contributors'
  s.homepage = 'https://example.invalid/show-control'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'Foundation', 'UIKit'
end
