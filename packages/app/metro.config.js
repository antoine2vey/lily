const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('node:path')

// Get the monorepo root
const monorepoRoot = path.resolve(__dirname, '../..')

const config = getDefaultConfig(__dirname)

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot]

// Ensure node_modules are resolved from the root
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Ensure React is resolved from a single location to avoid duplicate React errors
config.resolver.extraNodeModules = {
  react: path.resolve(monorepoRoot, 'node_modules/react'),
  'react-native': path.resolve(monorepoRoot, 'node_modules/react-native'),
}

// Node.js-only packages that should not be bundled for React Native
const nodeOnlyPackages = [
  '@google-cloud/storage',
  '@effect/sql-drizzle',
  '@effect/sql',
  'pg',
  'drizzle-orm',
  'ioredis',
  'resend',
  'expo-server-sdk',
  'fs',
  'path',
  'os',
  'crypto',
  'stream',
  'http',
  'https',
  'net',
  'tls',
  'zlib',
  'child_process',
  'events',
]

// Configure resolver to handle Node.js-only packages
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Return empty module for Node.js-only packages
  if (
    nodeOnlyPackages.some(
      (pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`)
    )
  ) {
    return {
      type: 'empty',
    }
  }
  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './src/global.css' })
