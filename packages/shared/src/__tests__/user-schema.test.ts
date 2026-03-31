import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  User,
  UserByIdRequest,
  UserCreateRequest,
  UserDeleteRequest,
  UserRole,
  UserSettings,
  UserSettingsUpdateRequest,
  UserStatus,
  UserUpdateRequest,
} from '../domains/user/schema'

// Test fixtures - use ISO strings for dates as that's what the schema expects for decoding
const validUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-15T00:00:00.000Z',
  emailVerified: true,
  image: 'https://example.com/avatar.jpg',
  bio: 'Plant enthusiast',
  careReminders: true,
  weeklyDigest: false,
  achievementNotifications: true,
  tips: true,
  productUpdates: false,
  ads: false,
  doNotDisturb: false,
  doNotDisturbStart: '22:00',
  doNotDisturbEnd: '08:00',
  historyViewCount: 5,
  role: 'user' as const,
  status: 'active' as const,
  timezone: 'America/New_York',
  preferredNotificationTime: '09:00',
  publicProfile: false,
  shareGrowthData: true,
  personalizedTips: true,
  language: 'en' as const,
  weatherEnabled: false,
  latitude: null,
  longitude: null,
  temperatureUnit: 'celsius' as const,
  deletedAt: null,
}

describe('User Schemas', () => {
  describe('UserRole', () => {
    it('should accept valid roles', () => {
      expect(Schema.decodeSync(UserRole)('user')).toBe('user')
      expect(Schema.decodeSync(UserRole)('admin')).toBe('admin')
    })

    it('should reject invalid roles', () => {
      expect(() => Schema.decodeSync(UserRole)('superadmin' as never)).toThrow()
      expect(() => Schema.decodeSync(UserRole)('moderator' as never)).toThrow()
    })
  })

  describe('UserStatus', () => {
    it('should accept valid statuses', () => {
      expect(Schema.decodeSync(UserStatus)('active')).toBe('active')
      expect(Schema.decodeSync(UserStatus)('suspended')).toBe('suspended')
      expect(Schema.decodeSync(UserStatus)('banned')).toBe('banned')
      expect(Schema.decodeSync(UserStatus)('pending_deletion')).toBe(
        'pending_deletion'
      )
    })

    it('should reject invalid statuses', () => {
      expect(() => Schema.decodeSync(UserStatus)('deleted' as never)).toThrow()
      expect(() => Schema.decodeSync(UserStatus)('pending' as never)).toThrow()
    })
  })

  describe('User', () => {
    it('should decode a valid user', () => {
      const result = Schema.decodeSync(User)(validUser)

      expect(result.id).toBe('user-123')
      expect(result.email).toBe('test@example.com')
      expect(result.role).toBe('user')
      expect(result.status).toBe('active')
    })

    it('should accept null for nullable fields', () => {
      const userWithNulls = {
        ...validUser,
        name: null,
        image: null,
        bio: null,
        doNotDisturbStart: null,
        doNotDisturbEnd: null,
        timezone: null,
        preferredNotificationTime: null,
      }

      const result = Schema.decodeSync(User)(userWithNulls)

      expect(result.name).toBeNull()
      expect(result.image).toBeNull()
      expect(result.timezone).toBeNull()
    })

    it('should accept admin role', () => {
      const adminUser = { ...validUser, role: 'admin' as const }

      const result = Schema.decodeSync(User)(adminUser)

      expect(result.role).toBe('admin')
    })

    it('should accept all status values', () => {
      const statuses = ['active', 'suspended', 'banned'] as const

      for (const status of statuses) {
        const user = { ...validUser, status }
        const result = Schema.decodeSync(User)(user)
        expect(result.status).toBe(status)
      }
    })

    it('should reject missing required fields', () => {
      const { email: _email, ...userWithoutEmail } = validUser

      expect(() => Schema.decodeSync(User)(userWithoutEmail as never)).toThrow()
    })

    it('should require boolean notification fields', () => {
      const result = Schema.decodeSync(User)(validUser)

      expect(typeof result.careReminders).toBe('boolean')
      expect(typeof result.weeklyDigest).toBe('boolean')
      expect(typeof result.achievementNotifications).toBe('boolean')
      expect(typeof result.tips).toBe('boolean')
      expect(typeof result.productUpdates).toBe('boolean')
      expect(typeof result.ads).toBe('boolean')
      expect(typeof result.doNotDisturb).toBe('boolean')
    })

    it('should require privacy boolean fields', () => {
      const result = Schema.decodeSync(User)(validUser)

      expect(typeof result.publicProfile).toBe('boolean')
      expect(typeof result.shareGrowthData).toBe('boolean')
      expect(typeof result.personalizedTips).toBe('boolean')
    })
  })

  describe('UserCreateRequest', () => {
    it('should decode a valid create request', () => {
      const request = {
        email: 'new@example.com',
        name: 'New User',
      }

      const result = Schema.decodeSync(UserCreateRequest)(request)

      expect(result.email).toBe('new@example.com')
      expect(result.name).toBe('New User')
    })

    it('should reject missing email', () => {
      const request = { name: 'New User' }

      expect(() =>
        Schema.decodeSync(UserCreateRequest)(request as never)
      ).toThrow()
    })

    it('should reject missing name', () => {
      const request = { email: 'new@example.com' }

      expect(() =>
        Schema.decodeSync(UserCreateRequest)(request as never)
      ).toThrow()
    })
  })

  describe('UserUpdateRequest', () => {
    it('should decode empty update request', () => {
      const result = Schema.decodeSync(UserUpdateRequest)({})

      expect(result).toEqual({})
    })

    it('should decode name update', () => {
      const request = { name: 'Updated Name' }

      const result = Schema.decodeSync(UserUpdateRequest)(request)

      expect(result.name).toBe('Updated Name')
    })

    it('should decode email update', () => {
      const request = { email: 'updated@example.com' }

      const result = Schema.decodeSync(UserUpdateRequest)(request)

      expect(result.email).toBe('updated@example.com')
    })

    it('should decode both fields update', () => {
      const request = {
        name: 'Updated Name',
        email: 'updated@example.com',
      }

      const result = Schema.decodeSync(UserUpdateRequest)(request)

      expect(result.name).toBe('Updated Name')
      expect(result.email).toBe('updated@example.com')
    })
  })

  describe('UserSettings', () => {
    it('should decode valid settings', () => {
      const settings = {
        name: 'Test User',
        email: 'test@example.com',
        notifications: {
          careReminders: true,
          weeklyDigest: false,
          achievements: true,
          tips: true,
          productUpdates: false,
          ads: false,
          doNotDisturb: false,
          doNotDisturbStart: '22:00',
          doNotDisturbEnd: '08:00',
        },
        privacy: {
          publicProfile: false,
          shareGrowthData: true,
          personalizedTips: true,
        },
        timezone: 'America/New_York',
        preferredNotificationTime: '09:00',
        language: 'en' as const,
        temperatureUnit: 'celsius' as const,
        weather: {
          enabled: false,
          latitude: null,
          longitude: null,
        },
      }

      const result = Schema.decodeSync(UserSettings)(settings)

      expect(result.email).toBe('test@example.com')
      expect(result.notifications.careReminders).toBe(true)
      expect(result.privacy.publicProfile).toBe(false)
    })

    it('should accept null for nullable fields', () => {
      const settings = {
        name: null,
        email: 'test@example.com',
        notifications: {
          careReminders: true,
          weeklyDigest: false,
          achievements: true,
          tips: true,
          productUpdates: false,
          ads: false,
          doNotDisturb: false,
          doNotDisturbStart: '',
          doNotDisturbEnd: '',
        },
        privacy: {
          publicProfile: false,
          shareGrowthData: true,
          personalizedTips: true,
        },
        timezone: null,
        preferredNotificationTime: null,
        language: 'en' as const,
        temperatureUnit: 'celsius' as const,
        weather: {
          enabled: false,
          latitude: null,
          longitude: null,
        },
      }

      const result = Schema.decodeSync(UserSettings)(settings)

      expect(result.name).toBeNull()
      expect(result.timezone).toBeNull()
    })

    it('should accept optional image and bio', () => {
      const settings = {
        name: 'Test',
        email: 'test@example.com',
        image: 'https://example.com/avatar.jpg',
        bio: 'Plant lover',
        notifications: {
          careReminders: true,
          weeklyDigest: false,
          achievements: true,
          tips: true,
          productUpdates: false,
          ads: false,
          doNotDisturb: false,
          doNotDisturbStart: '',
          doNotDisturbEnd: '',
        },
        privacy: {
          publicProfile: false,
          shareGrowthData: true,
          personalizedTips: true,
        },
        timezone: null,
        preferredNotificationTime: null,
        language: 'fr' as const,
        temperatureUnit: 'celsius' as const,
        weather: {
          enabled: false,
          latitude: null,
          longitude: null,
        },
      }

      const result = Schema.decodeSync(UserSettings)(settings)

      expect(result.image).toBe('https://example.com/avatar.jpg')
      expect(result.bio).toBe('Plant lover')
    })
  })

  describe('UserSettingsUpdateRequest', () => {
    it('should decode empty update', () => {
      const result = Schema.decodeSync(UserSettingsUpdateRequest)({})

      expect(result).toEqual({})
    })

    it('should decode name update', () => {
      const request = { name: 'New Name' }

      const result = Schema.decodeSync(UserSettingsUpdateRequest)(request)

      expect(result.name).toBe('New Name')
    })

    it('should decode partial notifications update', () => {
      const request = {
        notifications: {
          careReminders: false,
          doNotDisturb: true,
        },
      }

      const result = Schema.decodeSync(UserSettingsUpdateRequest)(request)

      expect(result.notifications?.careReminders).toBe(false)
      expect(result.notifications?.doNotDisturb).toBe(true)
      expect(result.notifications?.weeklyDigest).toBeUndefined()
    })

    it('should decode partial privacy update', () => {
      const request = {
        privacy: {
          publicProfile: true,
        },
      }

      const result = Schema.decodeSync(UserSettingsUpdateRequest)(request)

      expect(result.privacy?.publicProfile).toBe(true)
      expect(result.privacy?.shareGrowthData).toBeUndefined()
    })

    it('should decode timezone and notification time update', () => {
      const request = {
        timezone: 'Europe/London',
        preferredNotificationTime: '10:00',
      }

      const result = Schema.decodeSync(UserSettingsUpdateRequest)(request)

      expect(result.timezone).toBe('Europe/London')
      expect(result.preferredNotificationTime).toBe('10:00')
    })

    it('should decode full update', () => {
      const request = {
        name: 'Updated Name',
        image: 'https://new-image.com/avatar.jpg',
        bio: 'Updated bio',
        notifications: {
          careReminders: false,
          weeklyDigest: true,
          achievements: false,
          tips: false,
          productUpdates: true,
          ads: true,
          doNotDisturb: true,
          doNotDisturbStart: '21:00',
          doNotDisturbEnd: '07:00',
        },
        privacy: {
          publicProfile: true,
          shareGrowthData: false,
          personalizedTips: false,
        },
        timezone: 'Asia/Tokyo',
        preferredNotificationTime: '08:00',
      }

      const result = Schema.decodeSync(UserSettingsUpdateRequest)(request)

      expect(result.name).toBe('Updated Name')
      expect(result.notifications?.doNotDisturb).toBe(true)
      expect(result.privacy?.publicProfile).toBe(true)
    })
  })

  describe('UserByIdRequest', () => {
    it('should decode valid request', () => {
      const request = new UserByIdRequest({ id: 'user-123' })

      expect(request.id).toBe('user-123')
    })

    it('should be a Schema.Class', () => {
      const request = new UserByIdRequest({ id: 'user-123' })

      expect(request).toBeInstanceOf(UserByIdRequest)
    })
  })

  describe('UserDeleteRequest', () => {
    it('should decode valid request', () => {
      const request = new UserDeleteRequest({ id: 'user-456' })

      expect(request.id).toBe('user-456')
    })

    it('should be a Schema.Class', () => {
      const request = new UserDeleteRequest({ id: 'user-456' })

      expect(request).toBeInstanceOf(UserDeleteRequest)
    })
  })
})
