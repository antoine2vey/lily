// jest globals provided via @types/jest
import { resolveNotificationRoute } from '@/utils/notifications'

describe('resolveNotificationRoute', () => {
  it('routes watering_reminder with single plant to plant screen', () => {
    const route = resolveNotificationRoute({
      topic: 'watering_reminder',
      plantIds: 'plant-1',
    })
    expect(route).toBe('/(app)/plant/plant-1')
  })

  it('routes a care push with title and body to the plant screen', () => {
    const route = resolveNotificationRoute({
      topic: 'misting_reminder',
      title: 'Time to mist',
      body: 'Fern needs misting',
      plantIds: 'plant-3',
    })
    expect(route).toBe('/(app)/plant/plant-3')
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

  it('routes new_follower with a numeric senderId to null', () => {
    const route = resolveNotificationRoute({
      topic: 'new_follower',
      senderId: 99,
    })
    expect(route).toBeNull()
  })

  it('routes new_follower with an empty senderId to null', () => {
    const route = resolveNotificationRoute({
      topic: 'new_follower',
      senderId: '',
    })
    expect(route).toBeNull()
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

  describe.each([
    'delegation_request',
    'delegation_accepted',
    'delegation_rejected',
    'delegation_canceled',
    'delegation_activated',
    'delegation_completed',
  ])('%s', (topic) => {
    it('routes a delegationId to the delegation detail', () => {
      const route = resolveNotificationRoute({
        topic,
        title: 'Delegation',
        body: 'Someone asked you to care for their plants',
        delegationId: 'deleg-1',
      })
      expect(route).toBe('/(app)/delegation/deleg-1')
    })

    it('routes a numeric delegationId to the delegations list', () => {
      const route = resolveNotificationRoute({ topic, delegationId: 5 })
      expect(route).toBe('/(app)/delegations')
    })

    it('routes a push without a delegationId to the delegations list', () => {
      const route = resolveNotificationRoute({ topic })
      expect(route).toBe('/(app)/delegations')
    })

    it('routes an empty delegationId to the delegations list', () => {
      const route = resolveNotificationRoute({ topic, delegationId: '' })
      expect(route).toBe('/(app)/delegations')
    })
  })

  it('routes canopy_invitation with invitationId to the invitation', () => {
    const route = resolveNotificationRoute({
      topic: 'canopy_invitation',
      invitationId: 'inv-1',
    })
    expect(route).toBe('/(app)/canopy-invitation/inv-1')
  })

  it('routes canopy_invitation with a numeric invitationId to null', () => {
    const route = resolveNotificationRoute({
      topic: 'canopy_invitation',
      invitationId: 7,
    })
    expect(route).toBeNull()
  })

  it('routes canopy_invitation with an empty invitationId to null', () => {
    const route = resolveNotificationRoute({
      topic: 'canopy_invitation',
      invitationId: '',
    })
    expect(route).toBeNull()
  })

  it('routes canopy_member_joined to the Canopy screen despite an unknown key', () => {
    const route = resolveNotificationRoute({
      topic: 'canopy_member_joined',
      title: 'New member',
      body: 'Sam joined your Canopy',
      canopyId: 'canopy-1',
    })
    expect(route).toBe('/(app)/canopy')
  })

  it.each([
    ['canopy_member_removed', '/(app)/canopy'],
    ['canopy_member_left', '/(app)/canopy'],
    ['gift_subscription', '/(app)/(tabs)/plants'],
    ['resubscribe_nudge', '/(app)/subscription/upgrade'],
  ])('routes %s with a title and body to %s', (topic, expected) => {
    expect(
      resolveNotificationRoute({ topic, title: 'Lily', body: 'News' })
    ).toBe(expected)
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

  it('routes streak_at_risk to care tab', () => {
    const route = resolveNotificationRoute({
      topic: 'streak_at_risk',
    })
    expect(route).toBe('/(app)/(tabs)/care')
  })

  it('routes streak_milestone to achievements', () => {
    const route = resolveNotificationRoute({
      topic: 'streak_milestone',
    })
    expect(route).toBe('/(app)/achievements')
  })

  it('routes weekly_recap to home tab', () => {
    const route = resolveNotificationRoute({
      topic: 'weekly_recap',
    })
    expect(route).toBe('/(app)/(tabs)')
  })

  it('routes trial_ending to subscription screen', () => {
    const route = resolveNotificationRoute({
      topic: 'trial_ending',
    })
    expect(route).toBe('/(app)/subscription')
  })

  it('routes approaching_limit to upgrade screen', () => {
    const route = resolveNotificationRoute({
      topic: 'approaching_limit',
    })
    expect(route).toBe('/(app)/subscription/upgrade')
  })

  it('routes plant_anniversary with single plant to plant screen', () => {
    const route = resolveNotificationRoute({
      topic: 'plant_anniversary',
      plantIds: 'plant-7',
    })
    expect(route).toBe('/(app)/plant/plant-7')
  })

  it('routes plant_anniversary without plants to plants tab', () => {
    const route = resolveNotificationRoute({
      topic: 'plant_anniversary',
    })
    expect(route).toBe('/(app)/(tabs)/plants')
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
