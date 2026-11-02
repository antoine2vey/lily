import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  CANOPY_INVITE_TOKEN_LENGTH,
  CANOPY_NAME_MAX_LENGTH,
  CanopyInviteTokenRequest,
  CreateCanopyRequest,
  PlantOwner,
} from '../domains/canopy/schema'

describe('PlantOwner', () => {
  it('decodes a user owner and a Canopy owner', () => {
    expect(
      Schema.decodeUnknownSync(PlantOwner)({ _tag: 'User', userId: 'user-1' })
    ).toEqual({ _tag: 'User', userId: 'user-1' })
    expect(
      Schema.decodeUnknownSync(PlantOwner)({
        _tag: 'Canopy',
        canopyId: 'canopy-1',
      })
    ).toEqual({ _tag: 'Canopy', canopyId: 'canopy-1' })
  })

  it('rejects an owner that is neither', () => {
    expect(() =>
      Schema.decodeUnknownSync(PlantOwner)({ _tag: 'Room', roomId: 'room-1' })
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(PlantOwner)({ _tag: 'Canopy', userId: 'u' })
    ).toThrow()
  })
})

describe('CreateCanopyRequest', () => {
  it('trims the name', () => {
    expect(
      Schema.decodeUnknownSync(CreateCanopyRequest)({ name: '  Home  ' })
    ).toEqual({ name: 'Home' })
  })

  it('rejects a blank or overlong name', () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateCanopyRequest)({ name: '   ' })
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(CreateCanopyRequest)({
        name: 'a'.repeat(CANOPY_NAME_MAX_LENGTH + 1),
      })
    ).toThrow()
  })
})

describe('CanopyInviteTokenRequest', () => {
  it('takes a token of the issued length and refuses a longer one', () => {
    const token = 'a'.repeat(CANOPY_INVITE_TOKEN_LENGTH)
    expect(
      Schema.decodeUnknownSync(CanopyInviteTokenRequest)({ token })
    ).toEqual({ token })
    expect(() =>
      Schema.decodeUnknownSync(CanopyInviteTokenRequest)({ token: `${token}a` })
    ).toThrow()
  })
})
