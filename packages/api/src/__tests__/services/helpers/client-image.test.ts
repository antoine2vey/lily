import {
  createMockGCSService,
  MOCK_BUCKET_NAMES,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import {
  ClientImage,
  readClientImage,
} from '@lily/api/services/helpers/client-image'
import { mintStoredRef } from '@lily/shared/services/file/stored-ref-mint'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const privateUrl = (path: string, host = 'storage.googleapis.com') =>
  `https://${host}/${MOCK_BUCKET_NAMES.ai}/${path}`
const publicUrl = (path: string) =>
  `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/${path}`

const read = (ref: string) =>
  readClientImage(ref).pipe(
    Effect.provide(
      Layer.mergeAll(
        createMockGCSService(),
        createMockCurrentUser({ id: 'user-1' })
      )
    ),
    Effect.runPromise
  )

const ownKey = 'users/user-1/identify/photo.jpg'

describe('readClientImage', () => {
  it.each([
    ['a signed URL', privateUrl(`${ownKey}?X-Goog-Signature=abc`)],
    ['a bare key', ownKey],
    [
      'a URL that names the object from another host',
      privateUrl(ownKey, 'cdn.example'),
    ],
  ])("reads %s of the caller's upload as its key", async (_case, ref) => {
    expect(await read(ref)).toEqual(
      ClientImage.OwnUpload({ key: mintStoredRef(ownKey) })
    )
  })

  it.each([
    ['a URL on another host', 'https://tracker.example/pixel.jpg'],
    ["another user's upload", privateUrl('users/user-2/identify/photo.jpg')],
    [
      "another user's upload behind an encoded slash",
      privateUrl('users/user-1/..%2Fuser-2/identify/photo.jpg'),
    ],
    [
      "another user's upload as a bare key with a parent segment",
      'users/user-1/../user-2/identify/photo.jpg',
    ],
    [
      'a bare key with backslash parent segments',
      'users/user-1/identify/..\\..\\photo.jpg',
    ],
    [
      'a bare key with an encoded slash',
      'users/user-1/identify/..%2F..%2Fphoto.jpg',
    ],
    [
      'a URL with a twice-encoded slash',
      privateUrl('users/user-1/identify/..%252F..%252Fphoto.jpg'),
    ],
    ['a key with an empty segment', 'users/user-1//photo.jpg'],
    [
      "a user whose id starts with the caller's",
      privateUrl('users/user-10/identify/photo.jpg'),
    ],
    ['a private photo from before scopes', privateUrl('1700000000000-x.jpg')],
    ["the caller's own public photo", publicUrl('users/user-1/avatars/a.png')],
    ["a plant's public photo", publicUrl('plants/plant-1/cover.jpg')],
    [
      'a file on the device',
      'file:///var/mobile/Containers/Data/tmp/photo.jpg',
    ],
    ['a file URL with a host', 'file://fileserver.example/share/photo.jpg'],
    ['a data URL', 'data:image/png;base64,iVBORw0KGgo='],
    ['an empty string', ''],
    [
      "a URL that names two of the caller's uploads",
      privateUrl(`users/user-1/identify/${MOCK_BUCKET_NAMES.ai}/${ownKey}`),
    ],
    [
      'a reference too long to read',
      privateUrl(`${ownKey}?${'a'.repeat(2048)}`),
    ],
  ])('reads %s as untrusted', async (_case, ref) => {
    expect(await read(ref)).toEqual(ClientImage.Untrusted())
  })
})
