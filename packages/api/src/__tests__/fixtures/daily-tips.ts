import type { DailyTip } from '@lily/api/repositories/daily-tip.repository'

export const mockTip1: DailyTip = {
  id: 'tip-1',
  title: { en: 'Water in the morning', fr: 'Arrosez le matin' },
  body: {
    en: 'Water your plants in the morning for best absorption.',
    fr: 'Arrosez vos plantes le matin pour une meilleure absorption.',
  },
  category: 'watering',
  tags: ['watering', 'timing'],
  publishDate: '2026-03-09',
  createdAt: new Date('2026-03-09T06:00:00Z'),
}

export const mockTip2: DailyTip = {
  id: 'tip-2',
  title: {
    en: 'Check for pests weekly',
    fr: 'Vérifiez les parasites chaque semaine',
  },
  body: {
    en: 'Inspect leaves weekly to catch pest infestations early.',
    fr: 'Inspectez les feuilles chaque semaine pour détecter les parasites.',
  },
  category: 'pests',
  tags: ['pests', 'maintenance'],
  publishDate: '2026-03-08',
  createdAt: new Date('2026-03-08T06:00:00Z'),
}

export const mockDailyTips = [mockTip1, mockTip2]
