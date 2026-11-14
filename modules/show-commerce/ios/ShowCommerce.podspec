Pod::Spec.new do |s|
  s.name           = 'ShowCommerce'
  s.version        = '0.1.0'
  s.summary        = 'Isolated native show-control commerce bridge'
  s.description    = 'Loads, purchases, and restores the remove_promotions non-consumable without entering the show runtime.'
  s.author         = 'Show Control contributors'
  s.homepage       = 'https://example.invalid/show-control'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ShowAudio'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'StoreKit', 'UIKit'
end
