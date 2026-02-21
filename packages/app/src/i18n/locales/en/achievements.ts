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
    continue: 'Continue',
  },
  badges: {
    firstPlantAdded: {
      name: 'First Plant',
      description: 'Add your first plant',
    },
    wateringNovice: {
      name: 'Watering Novice',
      description: 'Water your plants 10 times',
    },
    plantCollector: {
      name: 'Plant Collector',
      description: 'Collect 5 different plants',
    },
    dedicatedCaretaker: {
      name: 'Dedicated Caretaker',
      description: 'Care for your plants for 30 days',
    },
  },
} as const
