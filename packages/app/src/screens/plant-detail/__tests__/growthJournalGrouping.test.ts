import type { PlantPhoto } from '@lily/shared'
import { groupPhotosByMonth } from '../growthJournalGrouping'

const photo = (id: string, iso: string): PlantPhoto => ({
  id,
  url: `https://example.com/${id}.jpg`,
  takenAt: new Date(iso),
  plantId: 'plant-1',
})

describe('groupPhotosByMonth', () => {
  it('returns an empty array when there are no photos', () => {
    expect(groupPhotosByMonth([], 'en-US')).toEqual([])
  })

  it('buckets photos by month, newest month first', () => {
    const groups = groupPhotosByMonth(
      [
        photo('a', '2025-05-10T10:00:00Z'),
        photo('b', '2025-06-02T10:00:00Z'),
        photo('c', '2025-06-20T10:00:00Z'),
      ],
      'en-US'
    )

    expect(groups.map((g) => g.key)).toEqual(['2025-06', '2025-05'])
  })

  it('orders photos newest-first within a month group', () => {
    const groups = groupPhotosByMonth(
      [
        photo('older', '2025-06-02T10:00:00Z'),
        photo('newer', '2025-06-20T10:00:00Z'),
      ],
      'en-US'
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.photos.map((p) => p.id)).toEqual(['newer', 'older'])
  })

  it('keeps photos from different years in separate groups', () => {
    const groups = groupPhotosByMonth(
      [
        photo('this-year', '2025-01-15T10:00:00Z'),
        photo('last-year', '2024-01-15T10:00:00Z'),
      ],
      'en-US'
    )

    expect(groups.map((g) => g.key)).toEqual(['2025-01', '2024-01'])
  })

  it('produces a non-empty human label per group', () => {
    const groups = groupPhotosByMonth(
      [photo('a', '2025-06-20T10:00:00Z')],
      'en-US'
    )

    expect(groups[0]?.label.length).toBeGreaterThan(0)
  })
})
