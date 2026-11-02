import {
  AlreadyInCanopyError,
  type Canopy,
  CanopyFullError,
  type CanopyId,
  type CanopyInvitationView,
  CanopyInviteExpiredError,
  CanopyInviteNotFoundError,
  type CanopyInvitePreview,
} from '@lily/shared'
import { Option, Result } from 'effect'
import {
  invitationSource,
  type JoinAttempt,
  type JoinInputs,
  type JoinOffer,
  type JoinSource,
  joinScreen,
  mayLeaveToJoin,
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

const linkOf = (p: CanopyInvitePreview): JoinOffer => ({
  _tag: 'Link',
  preview: p,
})

const canopyNamed = (name: string, id = 'canopy-1'): Canopy => ({
  id: id as CanopyId,
  name,
  timezone: 'Europe/Paris',
  latitude: null,
  longitude: null,
  role: 'owner',
  members: [],
  invite: null,
  invitations: [],
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
})

const idle: JoinAttempt = { _tag: 'Idle' }

const inputs = (overrides: Partial<JoinInputs>): JoinInputs => ({
  source: Option.some({ _tag: 'Link', token }),
  offer: Result.succeed(linkOf(preview)),
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
      joinScreen(inputs({ offer: Result.fail(new CanopyInviteExpiredError()) }))
    ).toEqual({ _tag: 'Expired' })
    expect(
      joinScreen(
        inputs({ offer: Result.fail(new CanopyInviteNotFoundError()) })
      )
    ).toEqual({ _tag: 'Invalid' })
  })

  it('calls a malformed token invalid without waiting for the API', () => {
    expect(
      joinScreen(
        inputs({ source: Option.none(), offer: undefined, mine: undefined })
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

describe('a Canopy the preview counts as full', () => {
  const full: CanopyInvitePreview = { ...preview, memberCount: 10 }
  const fullInputs = (overrides: Partial<JoinInputs>) =>
    inputs({ offer: Result.succeed(linkOf(full)), ...overrides })

  it('shows Full to a user in no Canopy', () => {
    expect(joinScreen(fullInputs({}))).toEqual({
      _tag: 'Full',
      preview: full,
      limit: 10,
    })
  })

  it('shows Full instead of offering to leave another Canopy', () => {
    expect(
      joinScreen(
        fullInputs({ mine: Result.succeed({ canopy: canopyNamed('Loft') }) })
      )
    ).toEqual({ _tag: 'Full', preview: full, limit: 10 })
  })

  it('shows Full when the accept answers AlreadyInCanopy', () => {
    const attempt: JoinAttempt = {
      _tag: 'Refused',
      error: new AlreadyInCanopyError({ canopyName: 'Loft' }),
    }
    expect(joinScreen(fullInputs({ attempt }))).toEqual({
      _tag: 'Full',
      preview: full,
      limit: 10,
    })
  })

  it('still lets a member open the Canopy they are in, which never leaves', () => {
    expect(
      joinScreen(
        fullInputs({
          mine: Result.succeed({ canopy: canopyNamed('Our Flat') }),
        })
      )._tag
    ).toBe('AlreadyHere')
  })
})

describe('mayLeaveToJoin, checked on a fresh preview before leaving', () => {
  const inLoft = Result.succeed({ canopy: canopyNamed('Loft') })
  const check = (fresh: JoinInputs['offer']) =>
    mayLeaveToJoin({
      source: Option.some({ _tag: 'Link', token }),
      offer: fresh,
      mine: inLoft,
    })

  it('allows the switch while the invite is still valid and has room', () => {
    expect(check(Result.succeed(linkOf(preview)))).toBe(true)
  })

  it('refuses when the invite was revoked, expired or filled since the screen loaded', () => {
    expect(check(Result.fail(new CanopyInviteNotFoundError()))).toBe(false)
    expect(check(Result.fail(new CanopyInviteExpiredError()))).toBe(false)
    expect(check(Result.succeed(linkOf({ ...preview, memberCount: 10 })))).toBe(
      false
    )
  })

  it('refuses when the fresh preview did not arrive', () => {
    expect(check(undefined)).toBe(false)
  })
})

describe('a direct invitation', () => {
  const INVITATION_ID = '0b9f7a52-3c1e-4d7a-9a51-6f2b8c4e1d30'
  const source: JoinSource = { _tag: 'Invitation', id: INVITATION_ID }
  const view = (
    status: CanopyInvitationView['status']
  ): CanopyInvitationView => ({
    ...preview,
    id: INVITATION_ID,
    canopyId: 'canopy-flat' as CanopyId,
    status,
  })
  const invited = (
    status: CanopyInvitationView['status'],
    overrides: Partial<JoinInputs> = {}
  ) =>
    joinScreen(
      inputs({
        source: Option.some(source),
        offer: Result.succeed({ _tag: 'Invitation', preview: view(status) }),
        ...overrides,
      })
    )

  it('offers to join while it is pending', () => {
    expect(invited('pending')).toEqual({
      _tag: 'Ready',
      preview: view('pending'),
      busy: false,
      failed: false,
    })
  })

  it.each(['withdrawn', 'declined'] as const)('is closed once %s', (status) => {
    expect(invited(status)).toEqual({ _tag: 'Closed' })
  })

  it('is expired once its date passed', () => {
    expect(invited('expired')).toEqual({ _tag: 'Expired' })
  })

  it('opens the Canopy for an invitee who accepted and stayed', () => {
    const inFlat = Result.succeed({
      canopy: canopyNamed('Renamed Flat', 'canopy-flat'),
    })
    expect(invited('accepted', { mine: inFlat })._tag).toBe('AlreadyHere')
  })

  it('is closed for an invitee who accepted and left', () => {
    expect(invited('accepted')).toEqual({ _tag: 'Closed' })
  })

  it('tells Canopies apart by id, not by name', () => {
    const namesake = Result.succeed({ canopy: canopyNamed('Our Flat') })
    expect(invited('pending', { mine: namesake })).toEqual({
      _tag: 'InAnotherCanopy',
      preview: view('pending'),
      currentName: 'Our Flat',
      busy: false,
    })
  })

  it('is closed when the API no longer finds it, where a link reads invalid', () => {
    expect(
      joinScreen(
        inputs({
          source: Option.some(source),
          offer: Result.fail(new CanopyInviteNotFoundError()),
        })
      )
    ).toEqual({ _tag: 'Closed' })
    expect(
      invited('pending', {
        attempt: { _tag: 'Refused', error: new CanopyInviteNotFoundError() },
      })
    ).toEqual({ _tag: 'Closed' })
  })

  it('does not leave another Canopy for an invitation withdrawn since the screen loaded', () => {
    expect(
      mayLeaveToJoin({
        source: Option.some(source),
        offer: Result.succeed({
          _tag: 'Invitation',
          preview: view('withdrawn'),
        }),
        mine: Result.succeed({ canopy: canopyNamed('Loft') }),
      })
    ).toBe(false)
  })

  it('reads only a uuid route parameter as an invitation', () => {
    expect(invitationSource(INVITATION_ID)).toEqual(Option.some(source))
    expect(invitationSource('not-an-id')).toEqual(Option.none())
    expect(invitationSource(undefined)).toEqual(Option.none())
  })
})
