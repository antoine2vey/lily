Pod::Spec.new do |s|
  s.name           = 'ExpoPlantScanner'
  s.version        = '1.0.0'
  s.summary        = 'Unified ARKit + TFLite plant scanner module for Expo'
  s.homepage       = 'https://github.com/lilyapp'
  s.license        = 'MIT'
  s.author         = 'Lily'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'
  s.resources      = ['*.tflite']
  s.dependency 'ExpoModulesCore'
  s.dependency 'TensorFlowLiteSwift', '~> 2.14'
  s.dependency 'TensorFlowLiteSwift/CoreML', '~> 2.14'
  s.frameworks     = 'ARKit', 'SceneKit'
end
