import { describe, expect, it } from '@jest/globals'
import { resolveNotificationRoute } from '@/utils/notifications'

describe('resolveNotificationRoute', () => {
  it('routes watering_reminder with single plant to plant screen', () => {
    const route = resolveNotificationRoute({
      topic: 'watering_reminder',
      plantIds: 'plant-1',
    })
    expect(route).toBe('/(app)/plant/plant-1')
  })

  it('routes watering_reminder with multiple plants to care tab', () => {
    const route = resolveNotificationRoute({
      topic: 'watering_reminder',
      plantIds: 'plant-1,plant-2',
    })
    expect(route).toBe('/(app)/(tabs)/care')
  })

  it('routes fertilization_reminder to care tab when no plants', () => {
    const route = resolveNotificationRoute({
      topic: 'fertilization_reminder',
    })
    expect(route).toBe('/(app)/(tabs)/care')
  })

  it('routes overdue_reminder with single plant to plant screen', () => {
    const route = resolveNotificationRoute({
      topic: 'overdue_reminder',
      plantIds: 'plant-42',
    })
    expect(route).toBe('/(app)/plant/plant-42')
  })

  it('routes new_follower with senderId to public profile', () => {
    const route = resolveNotificationRoute({
      topic: 'new_follower',
      senderId: 'user-99',
    })
    expect(route).toBe('/(app)/public-profile/user-99')
  })

  it('routes new_follower without senderId to null', () => {
    const route = resolveNotificationRoute({
      topic: 'new_follower',
    })
    expect(route).toBeNull()
  })

  it('routes nudge_to_water to care tab', () => {
    const route = resolveNotificationRoute({
      topic: 'nudge_to_water',
    })
    expect(route).toBe('/(app)/(tabs)/care')
  })

  it('routes delegation_request with delegationId to delegation detail', () => {
    const route = resolveNotificationRoute({
      topic: 'delegation_request',
      delegationId: 'deleg-1',
    })
    expect(route).toBe('/(app)/delegation/deleg-1')
  })

  it('routes delegation_accepted to delegation detail', () => {
    const route = resolveNotificationRoute({
      topic: 'delegation_accepted',
      delegationId: 'deleg-2',
    })
    expect(route).toBe('/(app)/delegation/deleg-2')
  })

  it('routes delegation_rejected to delegation detail', () => {
    const route = resolveNotificationRoute({
      topic: 'delegation_rejected',
      delegationId: 'deleg-3',
    })
    expect(route).toBe('/(app)/delegation/deleg-3')
  })

  it('routes delegation_canceled to delegations list when no id', () => {
    const route = resolveNotificationRoute({
      topic: 'delegation_canceled',
    })
    expect(route).toBe('/(app)/delegations')
  })

  it('routes delegation_activated to delegation detail', () => {
    const route = resolveNotificationRoute({
      topic: 'delegation_activated',
      delegationId: 'deleg-5',
    })
    expect(route).toBe('/(app)/delegation/deleg-5')
  })

  it('routes delegation_completed to delegation detail', () => {
    const route = resolveNotificationRoute({
      topic: 'delegation_completed',
      delegationId: 'deleg-6',
    })
    expect(route).toBe('/(app)/delegation/deleg-6')
  })

  it('routes daily_tip to tip modal with encoded params', () => {
    const route = resolveNotificationRoute({
      topic: 'daily_tip',
      title: 'Tip of the day',
      body: 'Water your plants in the morning',
    })
    expect(route).toBe(
      `/(app)/tip?title=${encodeURIComponent('Tip of the day')}&body=${encodeURIComponent('Water your plants in the morning')}`
    )
  })

  it('routes inactivity_nudge to plants tab', () => {
    const route = resolveNotificationRoute({
      topic: 'inactivity_nudge',
    })
    expect(route).toBe('/(app)/(tabs)/plants')
  })

  it('routes photo_reminder with single plant to plant screen', () => {
    const route = resolveNotificationRoute({
      topic: 'photo_reminder',
      plantIds: 'plant-photo',
    })
    expect(route).toBe('/(app)/plant/plant-photo')
  })

  it('routes plant_parent_milestone to achievements', () => {
    const route = resolveNotificationRoute({
      topic: 'plant_parent_milestone',
    })
    expect(route).toBe('/(app)/achievements')
  })

  it('returns null for unknown topic', () => {
    const route = resolveNotificationRoute({
      topic: 'something_new',
    })
    expect(route).toBeNull()
  })

  it('returns null when no topic is present', () => {
    const route = resolveNotificationRoute({})
    expect(route).toBeNull()
  })

  it('handles non-string plantIds gracefully', () => {
    const route = resolveNotificationRoute({
      topic: 'watering_reminder',
      plantIds: 42,
    })
    expect(route).toBe('/(app)/(tabs)/care')
  })
})
