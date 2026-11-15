import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  legacyOwnerOf,
  locateStoredObject,
} from '../services/file/stored-object'

const locate = locateStoredObject({ plant: 'lily-plants', ai: 'lily-ai' })

describe('locateStoredObject', () => {
  it.each([
    [
      'a public URL of the plant bucket',
      'https://storage.googleapis.com/lily-plants/plants/p1/a.png',
      { bucket: 'plant', key: 'plants/p1/a.png' },
    ],
    [
      'a signed URL of the ai bucket',
      'https://storage.googleapis.com/lily-ai/users/u1/detect/a.png?X-Goog-Signature=abc',
      { bucket: 'ai', key: 'users/u1/detect/a.png' },
    ],
    [
      'a bare key, which only the ai bucket is stored as',
      '1700-chat/c1/a.png',
      { bucket: 'ai', key: '1700-chat/c1/a.png' },
    ],
    [
      'a percent-encoded key',
      'https://storage.googleapis.com/lily-plants/plants/p1/a%20b.png',
      { bucket: 'plant', key: 'plants/p1/a b.png' },
    ],
  ])('finds %s', (_case, ref, object) => {
    expect(locate(ref)).toEqual(Option.some(object))
  })

  it.each([
    ['an OAuth avatar', 'https://lh3.googleusercontent.com/a/photo'],
    ['another bucket', 'https://storage.googleapis.com/other/plants/p1/a.png'],
    ['a bucket with no key', 'https://storage.googleapis.com/lily-plants/'],
    ['a local file', 'file:///var/mobile/photo.jpg'],
    ['an empty string', ''],
  ])('finds nothing for %s', (_case, ref) => {
    expect(locate(ref)).toEqual(Option.none())
  })
})

describe('legacyOwnerOf', () => {
  it.each([
    ['1700-avatars/u1/a.png', { _tag: 'Avatar', userId: 'u1' }],
    ['1700-avatars/u1-1699.png', { _tag: 'Avatar', userId: 'u1' }],
    [
      '1700-avatars/3f0c8a52-1b7e-4d0a-9c1e-123456789012-1699.jpg',
      { _tag: 'Avatar', userId: '3f0c8a52-1b7e-4d0a-9c1e-123456789012' },
    ],
    ['1700-plants/p1/a.png', { _tag: 'Plant', plantId: 'p1' }],
    ['1700-detect/a.png', { _tag: 'Unnamed' }],
    ['1700-chat/c1/a.png', { _tag: 'Unnamed' }],
    ['1700-IMG_0042.jpg', { _tag: 'Unnamed' }],
    ['1700-scan-card-1699.jpg', { _tag: 'Unnamed' }],
  ])('reads the owner of %s', (key, owner) => {
    expect(legacyOwnerOf(key)).toEqual(Option.some(owner))
  })

  it.each([
    'users/u1/avatars/a.png',
    'plants/p1/a.png',
    'avatars/u1/a.png',
    'catalog/monstera.png',
  ])('is not a legacy upload: %s', (key) => {
    expect(legacyOwnerOf(key)).toEqual(Option.none())
  })
})
