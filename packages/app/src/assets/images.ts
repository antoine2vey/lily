// Image assets for Lily app
// Extracted from design mockups in ~/Downloads/lily_screens/

export const images = {
  // Login screen - watercolor plants illustration
  plantsIllustration: require('../../assets/images/plants-illustration.png'),

  // Check email screen - envelope with plant sprout
  envelopePlant: require('../../assets/images/envelope-plant.png'),

  // Home empty state - terracotta pot with seedling
  seedlingPot: require('../../assets/images/seedling-pot.png'),
} as const

export type ImageKey = keyof typeof images
