require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoPlantScanner'
  s.version        = '1.0.0'
  s.summary        = 'Unified ARKit + TFLite plant scanner module for Expo'
  s.homepage       = 'https://github.com/antoine2vey/lily'
  s.license        = package['license']
  s.author         = 'Lily'
  s.source         = { git: 'https://github.com/antoine2vey/lily.git' }
  s.platform       = :ios, '16.4'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'
  s.resources      = ['*.tflite']
  s.dependency 'ExpoModulesCore'
  s.dependency 'TensorFlowLiteSwift', '~> 2.14'
  s.dependency 'TensorFlowLiteSwift/CoreML', '~> 2.14'
  s.frameworks     = 'ARKit', 'SceneKit'
end
