import { planImageUpload } from '@lily/shared/services/file/image-upload'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (text: string) => new TextEncoder().encode(text)

const plan = (input: Uint8Array) =>
  Effect.runSyncExit(planImageUpload(input, 'avatars/user-1'))

describe('planImageUpload', () => {
  it.each([
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg', 'jpg'],
    [
      'PNG',
      bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      'image/png',
      'png',
    ],
    ['WebP', ascii('RIFF\x00\x00\x00\x00WEBPVP8 '), 'image/webp', 'webp'],
  ])(
    'stores a %s under a generated key with the sniffed type',
    (_name, input, contentType, extension) => {
      const exit = plan(input)

      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.contentType).toBe(contentType)
        expect(exit.value.key).toMatch(
          new RegExp(`^\\d+-avatars/user-1/[0-9a-f-]{36}\\.${extension}$`)
        )
      }
    }
  )

  it.each([
    ['HTML', ascii('<!doctype html><script>alert(1)</script>')],
    ['SVG', ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['PDF', ascii('%PDF-1.4')],
    ['plain text', ascii('plain text')],
    ['empty', new Uint8Array()],
  ])('refuses %s', (_name, input) => {
    const exit = plan(input)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause.toString()).toContain('InvalidImageError')
    }
  })

  it('refuses an image over 10 MB', () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set([0xff, 0xd8, 0xff])

    const exit = plan(big)

    expect(Exit.isFailure(exit)).toBe(true)
  })
})
