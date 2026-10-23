import type { AchievementKey } from '@lily/shared'

export default {
  title: 'Achievements',
  level: 'Level {level}',
  progress: '{unlocked} of {total} achievements',
  categories: {
    collection: 'Plant Collection',
    care: 'Plant Care',
    streaks: 'Streaks',
    special: 'Special',
  },
  rarity: {
    common: 'Common',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary',
  },
  status: {
    unlocked: 'Unlocked {date}',
    progressCompleted: '{current} / {max} completed',
    keepGoing: 'Keep going to unlock this achievement',
    unknown: 'Unknown',
  },
  unlockModal: {
    title: 'Achievement Unlocked!',
    titleMany: '{count} achievements unlocked!',
    next: 'Next',
    continue: 'Continue',
  },
  /** Copy per achievement key; the server's text is the English fallback. */
  catalog: {
    FIRST_PLANT_ADDED: {
      name: 'First Steps',
      description: 'Added your first plant to the garden',
    },
    WATERING_NOVICE: {
      name: 'Watering Novice',
      description: 'Watered your plants 10 times',
    },
    PLANT_COLLECTOR: {
      name: 'Plant Collector',
      description: 'Collected 5 plants in your garden',
    },
    DEDICATED_CARETAKER: {
      name: 'Dedicated Caretaker',
      description: 'Cared for plants 3 days in a row',
    },
    ATTENTION_ALERT: {
      name: 'Attention Alert',
      description: 'Responded to a plant needing attention',
    },
    PHOTO_PRO: {
      name: 'Photo Pro',
      description: 'Uploaded 10 plant photos',
    },
    RARE_COLLECTOR: {
      name: 'Rare Collector',
      description: 'Added a rare plant to your collection',
    },
    SCAN_CHAMP: {
      name: 'Scan Champion',
      description: 'Scanned 5 plant cards',
    },
    FERTILIZER_GURU: {
      name: 'Fertilizer Guru',
      description: 'Fertilized your plants 10 times',
    },
    HISTORY_HERO: {
      name: 'History Hero',
      description: 'Viewed your care history',
    },
    AI_CONVERSATIONALIST: {
      name: 'AI Conversationalist',
      description: 'Had your first chat with the AI assistant',
    },
    DISEASE_DETECTIVE: {
      name: 'Disease Detective',
      description: 'Identified a plant disease',
    },
    GROWTH_TRACKER: {
      name: 'Growth Tracker',
      description: 'Tracked plant growth over time',
    },
    REMINDER_RESCUER: {
      name: 'Reminder Rescuer',
      description: 'Responded to a care reminder',
    },
    SHARE_SPROUT: {
      name: 'Share Sprout',
      description: 'Shared a plant with someone',
    },
  } satisfies Record<AchievementKey, { name: string; description: string }>,
} as const
