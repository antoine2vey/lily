import {
  mapEventToStatus,
  mapRevenueCatStore,
} from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { describe, expect, it } from 'vitest'

describe('Webhook Helpers', () => {
  describe('mapRevenueCatStore', () => {
    it('should map APP_STORE correctly', () => {
      const result = mapRevenueCatStore('APP_STORE')

      expect(result).toBe('APP_STORE')
    })

    it('should map PLAY_STORE correctly', () => {
      const result = mapRevenueCatStore('PLAY_STORE')

      expect(result).toBe('PLAY_STORE')
    })

    it('should return null for unknown store', () => {
      const result = mapRevenueCatStore('AMAZON_STORE')

      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      const result = mapRevenueCatStore('')

      expect(result).toBeNull()
    })

    it('should return null for lowercase store name', () => {
      const result = mapRevenueCatStore('app_store')

      expect(result).toBeNull()
    })
  })

  describe('mapEventToStatus', () => {
    it('should map INITIAL_PURCHASE with TRIAL to trialing', () => {
      const result = mapEventToStatus('INITIAL_PURCHASE', 'TRIAL')

      expect(result).toBe('trialing')
    })

    it('should map INITIAL_PURCHASE without TRIAL to active', () => {
      const result = mapEventToStatus('INITIAL_PURCHASE', 'NORMAL')

      expect(result).toBe('active')
    })

    it('should map INITIAL_PURCHASE with null period_type to active', () => {
      const result = mapEventToStatus('INITIAL_PURCHASE', null)

      expect(result).toBe('active')
    })

    it('should map INITIAL_PURCHASE with undefined period_type to active', () => {
      const result = mapEventToStatus('INITIAL_PURCHASE', undefined)

      expect(result).toBe('active')
    })

    it('should map RENEWAL to active', () => {
      const result = mapEventToStatus('RENEWAL', null)

      expect(result).toBe('active')
    })

    it('should map CANCELLATION to canceled', () => {
      const result = mapEventToStatus('CANCELLATION', null)

      expect(result).toBe('canceled')
    })

    it('should map UNCANCELLATION to active', () => {
      const result = mapEventToStatus('UNCANCELLATION', null)

      expect(result).toBe('active')
    })

    it('should map EXPIRATION to expired', () => {
      const result = mapEventToStatus('EXPIRATION', null)

      expect(result).toBe('expired')
    })

    it('should map BILLING_ISSUE to past_due', () => {
      const result = mapEventToStatus('BILLING_ISSUE', null)

      expect(result).toBe('past_due')
    })

    it('should map PRODUCT_CHANGE to active', () => {
      const result = mapEventToStatus('PRODUCT_CHANGE', null)

      expect(result).toBe('active')
    })

    it('should default to active for unknown event type', () => {
      const result = mapEventToStatus('UNKNOWN_EVENT', null)

      expect(result).toBe('active')
    })
  })
})
