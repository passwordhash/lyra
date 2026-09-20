require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LyraFolderAccess'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.swift_version  = '5.0'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
end
