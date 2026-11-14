Pod::Spec.new do |s|
  s.name           = 'ShowAudio'
  s.version        = '0.2.0'
  s.summary        = 'AVAudioEngine-based offline show-audio engine'
  s.description    = 'Owns serialized eight-voice playback, native-clock fades, route safety, and remote commands.'
  s.author         = 'Show Control contributors'
  s.homepage       = 'https://example.invalid/show-control'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'AVFoundation', 'MediaPlayer'
end
