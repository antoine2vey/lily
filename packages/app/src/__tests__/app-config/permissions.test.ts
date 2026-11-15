import { execFileSync } from 'node:child_process'
import path from 'node:path'

type IntrospectedConfig = {
  ios: { infoPlist: Record<string, unknown> }
  android: { permissions: string[]; blockedPermissions?: string[] }
}

const appRoot = path.resolve(__dirname, '../../..')

const introspect = (): IntrospectedConfig =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(appRoot, 'node_modules/expo/bin/cli'),
        'config',
        '--type',
        'introspect',
        '--json',
      ],
      { cwd: appRoot, encoding: 'utf8', env: { ...process.env, CI: '1' } }
    )
  )

describe('declared app permissions', () => {
  let config: IntrospectedConfig

  beforeAll(() => {
    config = introspect()
  }, 120_000)

  it('declares only the iOS usage descriptions the app uses', () => {
    const usageKeys = Object.keys(config.ios.infoPlist)
      .filter((key) => key.endsWith('UsageDescription'))
      .sort()
    expect(usageKeys).toEqual([
      'NSCameraUsageDescription',
      'NSLocalNetworkUsageDescription',
      'NSLocationWhenInUseUsageDescription',
      'NSMotionUsageDescription',
      'NSPhotoLibraryUsageDescription',
    ])
  })

  it('shows Lily-specific text in every iOS permission prompt', () => {
    const generic = Object.entries(config.ios.infoPlist).filter(
      ([key, value]) =>
        key.endsWith('UsageDescription') &&
        typeof value === 'string' &&
        value.includes('$(PRODUCT_NAME)')
    )
    expect(generic).toEqual([])
  })

  it('declares only the Android permissions the app uses', () => {
    expect([...new Set(config.android.permissions)].sort()).toEqual([
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.CAMERA',
    ])
  })

  it('blocks the biometric permissions that expo-secure-store merges', () => {
    expect(config.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
      ])
    )
  })
})
