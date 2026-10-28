import {
  AlreadyInCanopyError,
  type Canopy,
  CanopyFullError,
  type CanopyId,
  CanopyInviteExpiredError,
  CanopyInviteNotFoundError,
  type CanopyInvitePreview,
} from '@lily/shared'
import { Option, Result } from 'effect'
import {
  type JoinAttempt,
  type JoinInputs,
  joinScreen,
} from '@/screens/canopy-join/join-state'
import { type InviteToken, parseInviteToken } from '@/utils/canopy-invite-token'

const token = Option.getOrThrow(
  parseInviteToken('U97umPWqTRea_CZl99IrKv07PctPfxf7mjipVeP7HcM')
) as InviteToken

const preview: CanopyInvitePreview = {
  canopyName: 'Our Flat',
  inviterName: 'Alex',
  memberCount: 2,
  expiresAt: new Date('2026-11-04T00:00:00Z'),
}

const canopyNamed = (name: string): Canopy => ({
  id: 'canopy-1' as CanopyId,
  name,
  timezone: 'Europe/Paris',
  latitude: null,
  longitude: null,
  role: 'owner',
  members: [],
  invite: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
})

const idle: JoinAttempt = { _tag: 'Idle' }

const inputs = (overrides: Partial<JoinInputs>): JoinInputs => ({
  token: Option.some(token),
  preview: Result.succeed(preview),
  mine: Result.succeed({ canopy: null }),
  attempt: idle,
  ...overrides,
})

describe('joinScreen', () => {
  it('offers to join when the user is in no Canopy', () => {
    expect(joinScreen(inputs({}))).toEqual({
      _tag: 'Ready',
      preview,
      busy: false,
      failed: false,
    })
  })

  it('offers to leave first when the user is in another Canopy', () => {
    expect(
      joinScreen(
        inputs({ mine: Result.succeed({ canopy: canopyNamed('Loft') }) })
      )
    ).toEqual({
      _tag: 'InAnotherCanopy',
      preview,
      currentName: 'Loft',
      busy: false,
    })
  })

  it('switches to leave-first when the accept answers AlreadyInCanopy', () => {
    const attempt: JoinAttempt = {
      _tag: 'Refused',
      error: new AlreadyInCanopyError({ canopyName: "Sam's Studio" }),
    }
    expect(joinScreen(inputs({ attempt }))).toEqual({
      _tag: 'InAnotherCanopy',
      preview,
      currentName: "Sam's Studio",
      busy: false,
    })
  })

  it('treats a Canopy with the invite name as the one the user is in', () => {
    expect(
      joinScreen(
        inputs({ mine: Result.succeed({ canopy: canopyNamed('Our Flat') }) })
      )._tag
    ).toBe('AlreadyHere')
  })

  it('names the expired and invalid states from the preview', () => {
    expect(
      joinScreen(
        inputs({ preview: Result.fail(new CanopyInviteExpiredError()) })
      )
    ).toEqual({ _tag: 'Expired' })
    expect(
      joinScreen(
        inputs({ preview: Result.fail(new CanopyInviteNotFoundError()) })
      )
    ).toEqual({ _tag: 'Invalid' })
  })

  it('calls a malformed token invalid without waiting for the API', () => {
    expect(
      joinScreen(
        inputs({ token: Option.none(), preview: undefined, mine: undefined })
      )
    ).toEqual({ _tag: 'Invalid' })
  })

  it('reports a full Canopy with its limit', () => {
    const attempt: JoinAttempt = {
      _tag: 'Refused',
      error: new CanopyFullError({ limit: 10 }),
    }
    expect(joinScreen(inputs({ attempt }))).toEqual({
      _tag: 'Full',
      preview,
      limit: 10,
    })
  })

  it('opens the plant picker after a join', () => {
    expect(
      joinScreen(
        inputs({ attempt: { _tag: 'Joined', canopyName: 'Our Flat' } })
      )
    ).toEqual({ _tag: 'PickPlants', canopyName: 'Our Flat' })
  })
})
