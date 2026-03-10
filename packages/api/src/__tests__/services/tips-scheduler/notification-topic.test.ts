import { mapNotificationTypeToTopic } from '@lily/api/services/notification-scheduler/scheduler'
import { NOTIFICATION_TOPICS } from '@lily/shared/server'
import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

describe('daily_tip notification topic', () => {
  it('should be included in NOTIFICATION_TOPICS', () => {
    expect(Array.contains(NOTIFICATION_TOPICS, 'daily_tip')).toBe(true)
  })

  it('should map daily_tip type to daily_tip topic', () => {
    const result = mapNotificationTypeToTopic('daily_tip')
    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrNull(result)).toBe('daily_tip')
  })

  it('should still map existing types correctly', () => {
    const wateringResult = mapNotificationTypeToTopic('watering_reminder')
    expect(Option.getOrNull(wateringResult)).toBe('watering_reminder')

    const followerResult = mapNotificationTypeToTopic('new_follower')
    expect(Option.getOrNull(followerResult)).toBe('new_follower')

    const delegationResult = mapNotificationTypeToTopic('delegation_request')
    expect(Option.getOrNull(delegationResult)).toBe('delegation_request')
  })

  it('should return None for unknown types', () => {
    const result = mapNotificationTypeToTopic('unknown_type')
    expect(Option.isNone(result)).toBe(true)
  })
})
