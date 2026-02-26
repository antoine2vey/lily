import { categorize } from '@lily/api/services/knowledge-ingestion/processing/categorizer'
import { describe, expect, it } from 'vitest'

describe('categorize', () => {
  it('should return watering_advice for watering-related content', () => {
    const content =
      'You should adjust your watering schedule based on soil moisture levels. Overwatering leads to root rot.'
    expect(categorize(content)).toBe('watering_advice')
  })

  it('should return pest_identification for pest-related content', () => {
    const content =
      'Spider mites and mealybugs are common pests. Use neem oil to treat the infestation.'
    expect(categorize(content)).toBe('pest_identification')
  })

  it('should return disease_diagnosis for disease-related content', () => {
    const content =
      'Fungal disease causing leaf spot and yellowing. Apply fungicide to affected areas.'
    expect(categorize(content)).toBe('disease_diagnosis')
  })

  it('should return light_requirements for light-related content', () => {
    const content =
      'This plant needs bright indirect light. Avoid direct sunlight from a south facing window.'
    expect(categorize(content)).toBe('light_requirements')
  })

  it('should return soil_nutrients for soil-related content', () => {
    const content =
      'Use a well-draining potting mix with perlite. Add fertilizer with balanced NPK for proper nutrient levels.'
    expect(categorize(content)).toBe('soil_nutrients')
  })

  it('should return propagation for propagation-related content', () => {
    const content =
      'Take a stem cutting below a node. Dip in rooting hormone and use water propagation.'
    expect(categorize(content)).toBe('propagation')
  })

  it('should return general_care for general care content', () => {
    const content =
      'Basic plant care tips for beginners. Focus on pruning, temperature and humidity for good growth.'
    expect(categorize(content)).toBe('general_care')
  })

  it('should return general_care when no keywords match', () => {
    const content = 'Lorem ipsum dolor sit amet consectetur adipiscing elit.'
    expect(categorize(content)).toBe('general_care')
  })

  it('should be case-insensitive', () => {
    const content =
      'WATERING schedule for OVERWATERING prevention with proper MOISTURE levels.'
    expect(categorize(content)).toBe('watering_advice')
  })

  it('should return highest-score category when multiple match', () => {
    // Content with more pest keywords than watering keywords
    const content =
      'Spider mite and mealybug pest infestation on my plant. I noticed aphids too. Used neem oil. Also check watering.'
    expect(categorize(content)).toBe('pest_identification')
  })

  it('should return general_care for empty string', () => {
    expect(categorize('')).toBe('general_care')
  })
})
