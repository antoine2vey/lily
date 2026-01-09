import type { AchievementKey } from './schema'

export interface AchievementDefinition {
  name: string
  description: string
  iconUrl: string
  threshold?: number
}

export const ACHIEVEMENTS: Record<AchievementKey, AchievementDefinition> = {
  FIRST_PLANT_ADDED: {
    name: 'First Steps',
    description: 'Added your first plant to the garden',
    iconUrl: '/achievements/first-plant.png',
  },
  WATERING_NOVICE: {
    name: 'Watering Novice',
    description: 'Watered your plants 10 times',
    iconUrl: '/achievements/watering-novice.png',
    threshold: 10,
  },
  PLANT_COLLECTOR: {
    name: 'Plant Collector',
    description: 'Collected 5 plants in your garden',
    iconUrl: '/achievements/collector.png',
    threshold: 5,
  },
  DEDICATED_CARETAKER: {
    name: 'Dedicated Caretaker',
    description: 'Cared for plants 3 days in a row',
    iconUrl: '/achievements/dedicated.png',
    threshold: 3,
  },
  ATTENTION_ALERT: {
    name: 'Attention Alert',
    description: 'Responded to a plant needing attention',
    iconUrl: '/achievements/attention.png',
  },
  PHOTO_PRO: {
    name: 'Photo Pro',
    description: 'Uploaded 10 plant photos',
    iconUrl: '/achievements/photo.png',
    threshold: 10,
  },
  RARE_COLLECTOR: {
    name: 'Rare Collector',
    description: 'Added a rare plant to your collection',
    iconUrl: '/achievements/rare.png',
  },
  SCAN_CHAMP: {
    name: 'Scan Champion',
    description: 'Scanned 5 plant cards',
    iconUrl: '/achievements/scan.png',
    threshold: 5,
  },
  FERTILIZER_GURU: {
    name: 'Fertilizer Guru',
    description: 'Fertilized your plants 10 times',
    iconUrl: '/achievements/fertilizer.png',
    threshold: 10,
  },
  HISTORY_HERO: {
    name: 'History Hero',
    description: 'Viewed your care history',
    iconUrl: '/achievements/history.png',
  },
  AI_CONVERSATIONALIST: {
    name: 'AI Conversationalist',
    description: 'Had your first chat with the AI assistant',
    iconUrl: '/achievements/ai-chat.png',
  },
  DISEASE_DETECTIVE: {
    name: 'Disease Detective',
    description: 'Identified a plant disease',
    iconUrl: '/achievements/disease.png',
  },
  GROWTH_TRACKER: {
    name: 'Growth Tracker',
    description: 'Tracked plant growth over time',
    iconUrl: '/achievements/growth.png',
  },
  REMINDER_RESCUER: {
    name: 'Reminder Rescuer',
    description: 'Responded to a care reminder',
    iconUrl: '/achievements/reminder.png',
  },
  SHARE_SPROUT: {
    name: 'Share Sprout',
    description: 'Shared a plant with someone',
    iconUrl: '/achievements/share.png',
  },
}
