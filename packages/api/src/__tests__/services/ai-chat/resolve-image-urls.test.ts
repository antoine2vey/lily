import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import {
  resolveImageUrl,
  resolveImageUrls,
  resolveMessageImageUrls,
} from '@lily/api/services/ai-chat/resolve-image-urls'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('resolve-image-urls', () => {
  describe('resolveImageUrl', () => {
    it('should return signed URL for valid GCS key', async () => {
      const result = await Effect.runPromise(
        resolveImageUrl('photos/plant-1.jpg').pipe(
          Effect.provide(createMockGCSService())
        )
      )

      expect(result).toContain('photos/plant-1.jpg')
      expect(result).toContain('signed=true')
    })

    it('should return undefined when imageUrl is undefined', async () => {
      const result = await Effect.runPromise(
        resolveImageUrl(undefined).pipe(Effect.provide(createMockGCSService()))
      )

      expect(result).toBeUndefined()
    })
  })

  describe('resolveImageUrls', () => {
    it('should resolve image URLs for items with imageUrl', async () => {
      const items = [
        { id: '1', imageUrl: 'photos/plant-1.jpg' },
        { id: '2', imageUrl: 'photos/plant-2.jpg' },
      ]

      const result = await Effect.runPromise(
        resolveImageUrls(items).pipe(Effect.provide(createMockGCSService()))
      )

      expect(result).toHaveLength(2)
      expect(result[0]?.imageUrl).toContain('signed=true')
      expect(result[1]?.imageUrl).toContain('signed=true')
    })

    it('should pass through items without imageUrl unchanged', async () => {
      const items = [
        { id: '1', imageUrl: undefined },
        { id: '2', imageUrl: 'photos/plant-2.jpg' },
      ]

      const result = await Effect.runPromise(
        resolveImageUrls(items).pipe(Effect.provide(createMockGCSService()))
      )

      expect(result[0]?.imageUrl).toBeUndefined()
      expect(result[1]?.imageUrl).toContain('signed=true')
    })

    it('should return items as-is when no imageUrls exist', async () => {
      const items = [{ id: '1', imageUrl: undefined }, { id: '2' }]

      const result = await Effect.runPromise(
        resolveImageUrls(items).pipe(Effect.provide(createMockGCSService()))
      )

      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe('1')
      expect(result[1]?.id).toBe('2')
    })
  })

  describe('resolveMessageImageUrls', () => {
    it('should resolve file part URLs in messages', async () => {
      const messages = [
        {
          id: 'msg-1',
          role: 'user' as const,
          parts: [
            { type: 'text' as const, text: 'Hello' },
            {
              type: 'file' as const,
              url: 'chat-images/img-1.jpg',
              mediaType: 'image/jpeg',
            },
          ],
          createdAt: new Date(),
        },
      ]

      const result = await Effect.runPromise(
        resolveMessageImageUrls(messages).pipe(
          Effect.provide(createMockGCSService())
        )
      )

      expect(result).toHaveLength(1)
      const filePart = result[0]?.parts.find(
        (p: { type: string }) => p.type === 'file'
      )
      expect((filePart as { url: string }).url).toContain('signed=true')
    })
  })
})
