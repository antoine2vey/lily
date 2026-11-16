import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { storageFailureMessage } from '../services/file/gcs-errors'
import {
  legacyOwnerOf,
  locateStoredObject,
  namedObjects,
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
      '1700000000000-chat/c1/a.png',
      { bucket: 'ai', key: '1700000000000-chat/c1/a.png' },
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
    [
      'a malformed escape',
      'https://storage.googleapis.com/lily-plants/1700000000000-detect/%E0%A4%A.png',
    ],
  ])('finds nothing for %s', (_case, ref) => {
    expect(locate(ref)).toEqual(Option.none())
  })
})

const named = namedObjects({ plant: 'lily-plants', ai: 'lily-ai' })

describe('namedObjects', () => {
  it.each([
    [
      'a public URL',
      'https://storage.googleapis.com/lily-plants/plants/p1/a.png',
      [{ bucket: 'plant', key: 'plants/p1/a.png' }],
    ],
    [
      'a signed URL, without its query',
      'https://storage.googleapis.com/lily-ai/users/u1/detect/a.png?X-Goog-Signature=abc#frag',
      [{ bucket: 'ai', key: 'users/u1/detect/a.png' }],
    ],
    [
      'a plain-http URL on another GCS host',
      'http://storage.cloud.google.com/lily-plants/1700000000000-a.png',
      [{ bucket: 'plant', key: '1700000000000-a.png' }],
    ],
    [
      'a virtual-host URL',
      'https://lily-plants.storage.googleapis.com/plants/p1/a.png?v=2',
      [{ bucket: 'plant', key: 'plants/p1/a.png' }],
    ],
    [
      'a JSON API download URL with an encoded key',
      'https://storage.googleapis.com/download/storage/v1/b/lily-plants/o/plants%2Fp1%2Fa.png?alt=media',
      [{ bucket: 'plant', key: 'plants/p1/a.png' }],
    ],
    [
      'a Firebase download URL',
      'https://firebasestorage.googleapis.com/v0/b/lily-ai/o/users%2Fu1%2Fa.png?alt=media',
      [{ bucket: 'ai', key: 'users/u1/a.png' }],
    ],
    [
      'a gs URL',
      'gs://lily-plants/plants/p1/a.png',
      [{ bucket: 'plant', key: 'plants/p1/a.png' }],
    ],
    [
      'a URL padded with whitespace',
      '  https://storage.googleapis.com/lily-plants/plants/p1/a.png\n',
      [{ bucket: 'plant', key: 'plants/p1/a.png' }],
    ],
    [
      'a scheme-less URL',
      'storage.googleapis.com/lily-plants/plants/p1/a.png',
      [{ bucket: 'plant', key: 'plants/p1/a.png' }],
    ],
    [
      'a bucket-prefixed key',
      'lily-ai/users/u1/chat/c1/a.png',
      [{ bucket: 'ai', key: 'users/u1/chat/c1/a.png' }],
    ],
  ])('reads %s', (_case, ref, objects) => {
    expect(named(ref)).toEqual(expect.arrayContaining(objects))
  })

  it('names both spellings of a percent-encoded key', () => {
    expect(
      named('https://storage.googleapis.com/lily-plants/plants/p1/a%20b.png')
    ).toEqual([
      { bucket: 'plant', key: 'plants/p1/a%20b.png' },
      { bucket: 'plant', key: 'plants/p1/a b.png' },
    ])
  })

  it('names a bare key in both buckets', () => {
    expect(named('1700000000000-chat/c1/a.png')).toEqual([
      { bucket: 'plant', key: '1700000000000-chat/c1/a.png' },
      { bucket: 'ai', key: '1700000000000-chat/c1/a.png' },
    ])
  })

  it.each([
    ['an empty reference', '   '],
    ['an OAuth avatar', 'https://lh3.googleusercontent.com/a/photo'],
    ['another bucket', 'https://storage.googleapis.com/other/plants/p1/a.png'],
    ['a bucket with no key', 'https://storage.googleapis.com/lily-plants/'],
  ])('names nothing for %s', (_case, ref) => {
    expect(named(ref)).toEqual([])
  })
})

describe('legacyOwnerOf', () => {
  it.each([
    ['1700000000000-avatars/u1/a.png', { _tag: 'Avatar', userId: 'u1' }],
    ['1700000000000-avatars/u1-1699.png', { _tag: 'Avatar', userId: 'u1' }],
    [
      '1700000000000-avatars/3f0c8a52-1b7e-4d0a-9c1e-123456789012-1699.jpg',
      { _tag: 'Avatar', userId: '3f0c8a52-1b7e-4d0a-9c1e-123456789012' },
    ],
    ['1700000000000-plants/p1/a.png', { _tag: 'Plant', plantId: 'p1' }],
    ['1700000000000-detect/a.png', { _tag: 'Unnamed' }],
    ['1700000000000-chat/c1/a.png', { _tag: 'Unnamed' }],
    ['1700000000000-IMG_0042.jpg', { _tag: 'Unnamed' }],
    ['1700000000000-scan-card-1699.jpg', { _tag: 'Unnamed' }],
  ])('reads the owner of %s', (key, owner) => {
    expect(legacyOwnerOf(key)).toEqual(Option.some(owner))
  })

  it.each([
    'users/u1/avatars/a.png',
    'plants/p1/a.png',
    'avatars/u1/a.png',
    'catalog/monstera.png',
    '1-detect/a.png',
    '170000000000-detect/a.png',
  ])('is not a legacy upload: %s', (key) => {
    expect(legacyOwnerOf(key)).toEqual(Option.none())
  })
})

describe('storageFailureMessage', () => {
  it('names every error of a prefix delete, which rejects with a list', () => {
    expect(
      storageFailureMessage([new Error('403 on a.png'), new Error('timeout')])
    ).toBe('403 on a.png; timeout')
  })
})
