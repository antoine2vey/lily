import { invalidateKeys, queryKeys } from '@/utils/query-keys'

describe('queryKeys', () => {
  describe('plants', () => {
    it('should have correct base key', () => {
      expect(queryKeys.plants.all).toEqual(['plants'])
    })

    it('should generate lists key', () => {
      expect(queryKeys.plants.lists()).toEqual(['plants', 'getPlants'])
    })

    it('should generate details key', () => {
      expect(queryKeys.plants.details()).toEqual(['plants', 'getPlant'])
    })
  })

  describe('careLogs', () => {
    it('should have correct base key', () => {
      expect(queryKeys.careLogs.all).toEqual(['careLogs'])
    })

    it('should generate lists key', () => {
      expect(queryKeys.careLogs.lists()).toEqual(['careLogs', 'getCareLogs'])
    })

    it('should generate recentActivities key', () => {
      expect(queryKeys.careLogs.recentActivities()).toEqual([
        'careLogs',
        'getRecentActivities',
      ])
    })
  })

  describe('careTasks', () => {
    it('should have correct base key', () => {
      expect(queryKeys.careTasks.all).toEqual(['careTasks'])
    })
  })

  describe('subscriptions', () => {
    it('should have correct base key', () => {
      expect(queryKeys.subscriptions.all).toEqual(['subscriptions'])
    })

    it('should generate current key', () => {
      expect(queryKeys.subscriptions.current()).toEqual([
        'subscriptions',
        'getCurrentSubscription',
      ])
    })
  })

  describe('users', () => {
    it('should have correct base key', () => {
      expect(queryKeys.users.all).toEqual(['users'])
    })

    it('should generate settings key', () => {
      expect(queryKeys.users.settings()).toEqual(['users', 'getUserSettings'])
    })
  })

  describe('notifications', () => {
    it('should have correct base key', () => {
      expect(queryKeys.notifications.all).toEqual(['notifications'])
    })
  })

  describe('achievements', () => {
    it('should have correct base key', () => {
      expect(queryKeys.achievements.all).toEqual(['achievements'])
    })
  })

  describe('auth', () => {
    it('should have correct base key', () => {
      expect(queryKeys.auth.all).toEqual(['auth'])
    })
  })
})

describe('invalidateKeys', () => {
  it('should have all domain keys', () => {
    expect(invalidateKeys).toHaveProperty('plants')
    expect(invalidateKeys).toHaveProperty('careLogs')
    expect(invalidateKeys).toHaveProperty('careTasks')
    expect(invalidateKeys).toHaveProperty('subscriptions')
    expect(invalidateKeys).toHaveProperty('users')
    expect(invalidateKeys).toHaveProperty('notifications')
    expect(invalidateKeys).toHaveProperty('achievements')
    expect(invalidateKeys).toHaveProperty('auth')
  })

  it('should reference correct base keys', () => {
    expect(invalidateKeys.plants).toEqual(['plants'])
    expect(invalidateKeys.careLogs).toEqual(['careLogs'])
    expect(invalidateKeys.careTasks).toEqual(['careTasks'])
    expect(invalidateKeys.subscriptions).toEqual(['subscriptions'])
    expect(invalidateKeys.users).toEqual(['users'])
    expect(invalidateKeys.notifications).toEqual(['notifications'])
    expect(invalidateKeys.achievements).toEqual(['achievements'])
    expect(invalidateKeys.auth).toEqual(['auth'])
  })
})
