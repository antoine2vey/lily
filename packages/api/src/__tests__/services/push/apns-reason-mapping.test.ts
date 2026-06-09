import { mapApnsReasonToPushError } from '@lily/api/services/push/expo-plus-apns.provider'
import { describe, expect, it } from 'vitest'

// The whole point of the reason-split: a failure that is the *provider's* fault
// (expired JWT, disallowed topic) must never be classified as terminal, because
// the worker retires the user's token on a terminal error.
describe('mapApnsReasonToPushError', () => {
  it.each(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])(
    'maps device-terminal reason %s to PushTokenInvalidatedError',
    (reason) => {
      const err = mapApnsReasonToPushError({ message: 'apns', reason })
      expect(err._tag).toBe('PushTokenInvalidatedError')
      if (err._tag === 'PushTokenInvalidatedError') {
        expect(err.reason).toBe(reason)
      }
    }
  )

  it.each(['ExpiredProviderToken', 'TopicDisallowed'])(
    'maps provider-fault reason %s to PushConfigError, NEVER terminal',
    (reason) => {
      const err = mapApnsReasonToPushError({ message: 'apns', reason })
      expect(err._tag).toBe('PushConfigError')
      // Regression guard: a provider fault must not retire a user's token.
      expect(err._tag).not.toBe('PushTokenInvalidatedError')
    }
  )

  it.each(['InternalServerError', 'TooManyRequests', 'Shutdown'])(
    'maps transient reason %s to PushSendError',
    (reason) => {
      expect(mapApnsReasonToPushError({ message: 'boom', reason })._tag).toBe(
        'PushSendError'
      )
    }
  )

  it('maps a missing reason to a transient PushSendError', () => {
    expect(mapApnsReasonToPushError({ message: 'boom' })._tag).toBe(
      'PushSendError'
    )
  })
})
