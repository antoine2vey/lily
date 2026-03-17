import { Record } from 'effect'
import type {
  AchievementCategory,
  AchievementKey,
  AchievementRarity,
} from './schema'

export interface AchievementDefinition {
  name: string
  description: string
  iconUrl: string
  icon: string
  category: AchievementCategory
  rarity: AchievementRarity
  threshold?: number
}

export const ACHIEVEMENTS: Record<AchievementKey, AchievementDefinition> = {
  FIRST_PLANT_ADDED: {
    name: 'First Steps',
    description: 'Added your first plant to the garden',
    iconUrl: '/achievements/first-plant.png',
    icon: 'eco',
    category: 'plants',
    rarity: 'common',
  },
  WATERING_NOVICE: {
    name: 'Watering Novice',
    description: 'Watered your plants 10 times',
    iconUrl: '/achievements/watering-novice.png',
    icon: 'water-drop',
    category: 'care',
    rarity: 'common',
    threshold: 10,
  },
  PLANT_COLLECTOR: {
    name: 'Plant Collector',
    description: 'Collected 5 plants in your garden',
    iconUrl: '/achievements/collector.png',
    icon: 'park',
    category: 'plants',
    rarity: 'rare',
    threshold: 5,
  },
  DEDICATED_CARETAKER: {
    name: 'Dedicated Caretaker',
    description: 'Cared for plants 3 days in a row',
    iconUrl: '/achievements/dedicated.png',
    icon: 'favorite',
    category: 'streaks',
    rarity: 'rare',
    threshold: 3,
  },
  ATTENTION_ALERT: {
    name: 'Attention Alert',
    description: 'Responded to a plant needing attention',
    iconUrl: '/achievements/attention.png',
    icon: 'notifications-active',
    category: 'care',
    rarity: 'common',
  },
  PHOTO_PRO: {
    name: 'Photo Pro',
    description: 'Uploaded 10 plant photos',
    iconUrl: '/achievements/photo.png',
    icon: 'camera',
    category: 'special',
    rarity: 'rare',
    threshold: 10,
  },
  RARE_COLLECTOR: {
    name: 'Rare Collector',
    description: 'Added a rare plant to your collection',
    iconUrl: '/achievements/rare.png',
    icon: 'star',
    category: 'plants',
    rarity: 'epic',
  },
  SCAN_CHAMP: {
    name: 'Scan Champion',
    description: 'Scanned 5 plant cards',
    iconUrl: '/achievements/scan.png',
    icon: 'qr-code-scanner',
    category: 'special',
    rarity: 'rare',
    threshold: 5,
  },
  FERTILIZER_GURU: {
    name: 'Fertilizer Guru',
    description: 'Fertilized your plants 10 times',
    iconUrl: '/achievements/fertilizer.png',
    icon: 'science',
    category: 'care',
    rarity: 'rare',
    threshold: 10,
  },
  HISTORY_HERO: {
    name: 'History Hero',
    description: 'Viewed your care history',
    iconUrl: '/achievements/history.png',
    icon: 'history',
    category: 'special',
    rarity: 'common',
  },
  AI_CONVERSATIONALIST: {
    name: 'AI Conversationalist',
    description: 'Had your first chat with the AI assistant',
    iconUrl: '/achievements/ai-chat.png',
    icon: 'chat',
    category: 'special',
    rarity: 'common',
  },
  DISEASE_DETECTIVE: {
    name: 'Disease Detective',
    description: 'Identified a plant disease',
    iconUrl: '/achievements/disease.png',
    icon: 'search',
    category: 'special',
    rarity: 'epic',
  },
  GROWTH_TRACKER: {
    name: 'Growth Tracker',
    description: 'Tracked plant growth over time',
    iconUrl: '/achievements/growth.png',
    icon: 'trending-up',
    category: 'care',
    rarity: 'common',
  },
  REMINDER_RESCUER: {
    name: 'Reminder Rescuer',
    description: 'Responded to a care reminder',
    iconUrl: '/achievements/reminder.png',
    icon: 'alarm',
    category: 'care',
    rarity: 'common',
  },
  SHARE_SPROUT: {
    name: 'Share Sprout',
    description: 'Shared a plant with someone',
    iconUrl: '/achievements/share.png',
    icon: 'share',
    category: 'special',
    rarity: 'rare',
  },
}

export const ACHIEVEMENT_KEYS: ReadonlyArray<AchievementKey> = Record.keys(
  ACHIEVEMENTS
) as ReadonlyArray<AchievementKey>
