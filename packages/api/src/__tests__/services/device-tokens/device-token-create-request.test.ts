import { DeviceTokenCreateRequest } from '@lily/shared/device-token'
import { Exit, Schema } from 'effect'
import Expo from 'expo-server-sdk'
import { describe, expect, it } from 'vitest'

const decode = (token: string) =>
  Schema.decodeUnknownExit(DeviceTokenCreateRequest)({
    token,
    platform: 'ios',
  })

describe('DeviceTokenCreateRequest', () => {
  it.each([
    'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    'ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  ])('accepts %s, which the push provider will send to', (token) => {
    expect(Exit.isSuccess(decode(token))).toBe(true)
    expect(Expo.isExpoPushToken(token)).toBe(true)
  })

  it.each([
    '',
    'not-an-expo-token',
    'ExponentPushToken[]',
    'ExponentPushToken[abc',
    '740f4707bebcf74f9b7c25d48e3358945f6aa01da5ddb387462c7eaf61bb78ad',
  ])('rejects %j', (token) => {
    expect(Exit.isFailure(decode(token))).toBe(true)
  })
})
