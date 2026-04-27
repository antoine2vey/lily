require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoLiveActivityLilyModule'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'Lily'
  s.homepage       = 'https://lilyapp.com'
  # Match the app's deployment target (15.1). Swift code is gated with
  # `@available(iOS 16.2, *)` / `if #available(iOS 17.2, *)` so ActivityKit
  # is only touched on OS versions that ship it. A higher deployment-target
  # here makes expo-modules-autolinking skip the pod entirely on iOS 15.x
  # targets — we want the module available on every iOS build.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  s.source_files = '**/*.{h,m,swift}'
end
