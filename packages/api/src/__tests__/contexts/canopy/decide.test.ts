import {
  type Account,
  type CanopyState,
  HELD_NOTHING,
  type Held,
  type HeldPlant,
  type Invitation,
} from '@lily/api/contexts/canopy/domain/canopy'
import {
  type CanopyChanges,
  CanopyWrite,
  createCanopy,
  createLink,
  declineInvitation,
  dissolve,
  Entry,
  invite,
  join,
  leave,
  type MoveFacts,
  Notice,
  type Placement,
  Refusal,
  RoomMove,
  removeMember,
  revokeLink,
  setMute,
  sharePlant,
  unsharePlant,
  updateCanopy,
  withdrawInvitation,
} from '@lily/api/contexts/canopy/domain/decide'
import { decision } from '@lily/api/kernel/transact'
import {
  CANOPY_MAX_MEMBERS,
  CanopyId,
  LimitExceededError,
  type PlantOwner,
} from '@lily/shared'
import { Array, DateTime, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

const now = DateTime.makeUnsafe('2026-11-13T09:00:00Z')
const homeId = CanopyId.make('canopy-1')

const home: CanopyState = {
  id: homeId,
  name: 'Home',
  timezone: 'Europe/Paris',
  members: [
    {
      userId: 'alex',
      role: 'owner',
      joinedAt: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
    },
    {
      userId: 'lily',
      role: 'member',
      joinedAt: DateTime.makeUnsafe('2024-05-01T00:00:00Z'),
    },
  ],
  link: Option.none(),
}

const atHome: Held = { ...HELD_NOTHING, canopy: Option.some(home) }

const account = (overrides: Partial<Account> = {}): Account => ({
  userId: 'sam',
  name: 'Sam',
  language: 'en',
  timezone: null,
  location: Option.none(),
  reachable: true,
  ...overrides,
})

const noChange: CanopyChanges = {
  name: Option.none(),
  timezone: Option.none(),
  latitude: Option.none(),
  longitude: Option.none(),
}

describe('createCanopy', () => {
  const create = (held: Held) =>
    createCanopy(held, {
      by: 'sam',
      canopyId: CanopyId.make('canopy-2'),
      name: 'Cabin',
      now,
    })

  it('refuses someone already in a canopy, naming it', () => {
    const decided = create({
      ...HELD_NOTHING,
      actorCanopy: Option.some({ canopyId: homeId, name: 'Home' }),
    })

    expect(decided).toEqual(
      Result.fail(Refusal.AlreadyInCanopy({ canopyName: 'Home' }))
    )
  })

  it('creates the canopy with the creator as its owner, in their timezone and at their location', () => {
    const paris = { latitude: 48.85, longitude: 2.35 }
    const decided = create({
      ...HELD_NOTHING,
      accounts: new Map([
        [
          'sam',
          account({ timezone: 'Europe/Paris', location: Option.some(paris) }),
        ],
      ]),
    })

    expect(decided).toEqual(
      Result.succeed(
        decision({ canopyId: 'canopy-2' }, [
          CanopyWrite.CreateCanopy({
            id: CanopyId.make('canopy-2'),
            name: 'Cabin',
            timezone: 'Europe/Paris',
            location: Option.some(paris),
          }),
          CanopyWrite.AddMember({
            canopyId: CanopyId.make('canopy-2'),
            userId: 'sam',
            role: 'owner',
            at: now,
          }),
        ])
      )
    )
  })

  it.each([
    ['has set no timezone', new Map([['sam', account()]])],
    ['has no account left', new Map<string, Account>()],
  ])(
    'falls back to UTC and no location when the creator %s',
    (_name, accounts) => {
      const decided = create({ ...HELD_NOTHING, accounts })

      expect(Result.map(decided, ({ writes }) => Array.head(writes))).toEqual(
        Result.succeed(
          Option.some(
            CanopyWrite.CreateCanopy({
              id: CanopyId.make('canopy-2'),
              name: 'Cabin',
              timezone: 'UTC',
              location: Option.none(),
            })
          )
        )
      )
    }
  )
})

describe('updateCanopy', () => {
  const update = (by: string, changes: Partial<CanopyChanges>, held = atHome) =>
    updateCanopy(held, { by, changes: { ...noChange, ...changes } })

  it.each([
    ['someone with no canopy', 'alex', HELD_NOTHING],
    ['someone who is not a member of the canopy held', 'sam', atHome],
  ])('refuses %s', (_name, by, held) => {
    expect(update(by, { name: Option.some('Nest') }, held)).toEqual(
      Result.fail(Refusal.NotMember())
    )
  })

  it('lets any member rename, and tells nobody', () => {
    const changes = { ...noChange, name: Option.some('Nest') }

    expect(update('lily', changes)).toEqual(
      Result.succeed(
        decision({ canopyId: homeId }, [
          CanopyWrite.UpdateCanopy({ canopyId: homeId, changes }),
        ])
      )
    )
  })

  it.each([
    ['the timezone', { timezone: Option.some('Asia/Tokyo') }],
    ['the latitude', { latitude: Option.some(48.85) }],
    ['a cleared latitude', { latitude: Option.some(null) }],
    ['the longitude', { longitude: Option.some(2.35) }],
    [
      'a name with a timezone',
      { name: Option.some('Nest'), timezone: Option.some('Asia/Tokyo') },
    ],
  ] satisfies ReadonlyArray<readonly [string, Partial<CanopyChanges>]>)(
    'refuses a member who changes %s, and lets the owner',
    (_name, changes) => {
      expect(update('lily', changes)).toEqual(Result.fail(Refusal.NotOwner()))
      expect(
        Result.map(update('alex', changes), ({ writes }) => writes)
      ).toEqual(
        Result.succeed([
          CanopyWrite.UpdateCanopy({
            canopyId: homeId,
            changes: { ...noChange, ...changes },
          }),
        ])
      )
    }
  )

  it('says the timezone changed only when the value differs', () => {
    const events = (timezone: string) =>
      Result.map(
        update('alex', { timezone: Option.some(timezone) }),
        (decided) => decided.events
      )

    expect(events('Asia/Tokyo')).toEqual(
      Result.succeed([{ _tag: 'CanopyTimezoneChanged', canopyId: homeId }])
    )
    expect(events('Europe/Paris')).toEqual(Result.succeed([]))
  })

  it('says nothing about the timezone when only the location moves', () => {
    expect(
      Result.map(
        update('alex', {
          latitude: Option.some(35.68),
          longitude: Option.some(139.69),
        }),
        (decided) => decided.events
      )
    ).toEqual(Result.succeed([]))
  })

  it('writes nothing for an empty change, and still needs a member', () => {
    expect(update('lily', {})).toEqual(
      Result.succeed(decision({ canopyId: homeId }))
    )
    expect(update('sam', {})).toEqual(Result.fail(Refusal.NotMember()))
  })
})

describe('links', () => {
  const expiresAt = DateTime.add(now, { days: 7 })

  it.each([
    ['someone with no canopy', HELD_NOTHING],
    ['someone who is not a member of the canopy held', atHome],
  ])('refuses %s a new link and a revocation', (_name, held) => {
    expect(
      createLink(held, { by: 'sam', tokenHash: 'hash', expiresAt, now })
    ).toEqual(Result.fail(Refusal.NotMember()))
    expect(revokeLink(held, { by: 'sam', now })).toEqual(
      Result.fail(Refusal.NotMember())
    )
  })

  it.each(['alex', 'lily'])(
    'lets %s replace the link with one that carries the new hash',
    (by) => {
      expect(
        createLink(atHome, { by, tokenHash: 'new-hash', expiresAt, now })
      ).toEqual(
        Result.succeed(
          decision(undefined, [
            CanopyWrite.ReplaceLink({
              canopyId: homeId,
              tokenHash: 'new-hash',
              createdBy: by,
              expiresAt,
              at: now,
            }),
          ])
        )
      )
    }
  )

  it.each(['alex', 'lily'])(
    'lets %s revoke the live link whoever made it',
    (by) => {
      expect(revokeLink(atHome, { by, now })).toEqual(
        Result.succeed(
          decision(undefined, [
            CanopyWrite.RevokeLinks({
              canopyId: homeId,
              onlyCreatedBy: Option.none(),
              at: now,
            }),
          ])
        )
      )
    }
  )
})

describe('join', () => {
  const tomorrow = DateTime.add(now, { days: 1 })
  const justPassed = DateTime.toDateUtc(now)
  const stillOpen = DateTime.toDateUtc(DateTime.add(now, { milliseconds: 1 }))
  const cabin = { canopyId: CanopyId.make('canopy-2'), name: 'Cabin' }

  const accounts = new Map(
    Array.map(['alex', 'lily', 'sam'], (userId) => [
      userId,
      account({ userId, name: `${userId} the gardener`, language: 'fr' }),
    ])
  )

  const linked = (link: CanopyState['link']): Held => ({
    ...HELD_NOTHING,
    canopy: Option.some({ ...home, link }),
    accounts,
  })

  const withLink = linked(
    Option.some({ tokenHash: 'hash', expiresAt: tomorrow })
  )

  const invitation = (overrides: Partial<Invitation> = {}): Invitation => ({
    id: 'invitation-1',
    invitee: 'sam',
    invitedBy: 'lily',
    status: 'pending',
    expiresAt: stillOpen,
    resolvedAt: null,
    ...overrides,
  })

  const invited = (
    overrides: Partial<Invitation> = {},
    held: Held = atHome
  ): Held => ({
    ...held,
    accounts,
    invitations: [invitation(overrides)],
  })

  const byLink = (held: Held, joiner = 'sam') =>
    join(held, { joiner, via: Entry.Link({ tokenHash: 'hash' }), now })

  const byInvitation = (held: Held, joiner = 'sam') =>
    join(held, {
      joiner,
      via: Entry.Invitation({ invitationId: 'invitation-1' }),
      now,
    })

  const seated = (members: number): Held => ({
    ...withLink,
    canopy: Option.map(withLink.canopy, (canopy) => ({
      ...canopy,
      members: Array.makeBy(members, (n) => ({
        userId: `member-${n}`,
        role: n === 0 ? ('owner' as const) : ('member' as const),
        joinedAt: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
      })),
    })),
  })

  const addSam = CanopyWrite.AddMember({
    canopyId: homeId,
    userId: 'sam',
    role: 'member',
    at: now,
  })

  const accept = CanopyWrite.ResolveInvitation({
    id: 'invitation-1',
    to: 'accepted',
    at: now,
  })

  const noticeTo = (userId: string) =>
    Notice.MemberJoined({
      to: account({ userId, name: `${userId} the gardener`, language: 'fr' }),
      joinerName: 'sam the gardener',
      canopyName: 'Home',
    })

  const samJoined = { _tag: 'MemberJoined', canopyId: homeId, userId: 'sam' }

  describe('by link', () => {
    it.each([
      ['no canopy was found for it', HELD_NOTHING],
      ['the canopy has no live link', linked(Option.none())],
      [
        'the live link of the canopy is another one',
        linked(Option.some({ tokenHash: 'newer-hash', expiresAt: tomorrow })),
      ],
    ])('answers not found when %s', (_name, held) => {
      expect(byLink(held)).toEqual(Result.fail(Refusal.InviteNotFound()))
    })

    it('answers expired from the instant the link expires, and admits until then', () => {
      const expiring = (expiresAt: DateTime.Utc) =>
        byLink(linked(Option.some({ tokenHash: 'hash', expiresAt })))

      expect(expiring(now)).toEqual(Result.fail(Refusal.InviteExpired()))
      expect(
        Result.map(
          expiring(DateTime.add(now, { milliseconds: 1 })),
          ({ writes }) => writes
        )
      ).toEqual(Result.succeed([addSam]))
    })

    it('adds the joiner as a member, says so, and owes every member of before a notice', () => {
      expect(byLink(withLink)).toEqual(
        Result.succeed(
          decision(
            {
              value: { canopyId: homeId },
              notices: [noticeTo('alex'), noticeTo('lily')],
            },
            [addSam],
            [samJoined]
          )
        )
      )
    })
  })

  describe('by invitation', () => {
    it.each([
      ['no canopy was found for it', invited({}, HELD_NOTHING)],
      ['the invitation is not held', { ...atHome, accounts }],
      ['it invites someone else', invited({ invitee: 'noor' })],
      ['it is another invitation', invited({ id: 'invitation-2' })],
      ['it was declined', invited({ status: 'declined' })],
      ['it was withdrawn', invited({ status: 'withdrawn' })],
      [
        'it was accepted by someone who has left since',
        invited({ status: 'accepted' }),
      ],
    ])('answers not found when %s', (_name, held) => {
      expect(byInvitation(held)).toEqual(Result.fail(Refusal.InviteNotFound()))
    })

    it('answers expired from the instant the invitation lapses, even to a member', () => {
      const lapsedFor = (invitee: string) =>
        byInvitation(invited({ invitee, expiresAt: justPassed }), invitee)

      expect(lapsedFor('sam')).toEqual(Result.fail(Refusal.InviteExpired()))
      expect(lapsedFor('lily')).toEqual(Result.fail(Refusal.InviteExpired()))
    })

    it('adds the joiner, spends the invitation, and owes the same notices as a link', () => {
      expect(byInvitation(invited())).toEqual(
        Result.succeed(
          decision(
            {
              value: { canopyId: homeId },
              notices: [noticeTo('alex'), noticeTo('lily')],
            },
            [addSam, accept],
            [samJoined]
          )
        )
      )
    })
  })

  it('refuses someone in another canopy, naming it, whichever way they come', () => {
    const elsewhere = { actorCanopy: Option.some(cabin) }
    const refusal = Result.fail(
      Refusal.AlreadyInCanopy({ canopyName: 'Cabin' })
    )

    expect(byLink({ ...withLink, ...elsewhere })).toEqual(refusal)
    expect(byInvitation({ ...invited(), ...elsewhere })).toEqual(refusal)
  })

  it('lets a member in again by link with no write, no fact and no notice', () => {
    expect(byLink(withLink, 'lily')).toEqual(
      Result.succeed(decision({ value: { canopyId: homeId }, notices: [] }))
    )
  })

  it('spends the open invitation of someone who is already a member, and nothing else', () => {
    expect(byInvitation(invited({ invitee: 'lily' }), 'lily')).toEqual(
      Result.succeed(
        decision({ value: { canopyId: homeId }, notices: [] }, [accept])
      )
    )
  })

  it('lets a member in again by the invitation they already accepted, with no write', () => {
    expect(
      byInvitation(invited({ invitee: 'lily', status: 'accepted' }), 'lily')
    ).toEqual(
      Result.succeed(decision({ value: { canopyId: homeId }, notices: [] }))
    )
  })

  it('refuses the member past the limit, and admits the one who fills the last seat', () => {
    expect(byLink(seated(CANOPY_MAX_MEMBERS))).toEqual(
      Result.fail(Refusal.CanopyFull({ limit: CANOPY_MAX_MEMBERS }))
    )
    expect(
      Result.map(byLink(seated(CANOPY_MAX_MEMBERS - 1)), ({ writes }) => writes)
    ).toEqual(Result.succeed([addSam]))
  })

  it('answers not found to a joiner whose account is gone', () => {
    expect(
      byLink({ ...withLink, accounts: new Map([['alex', account()]]) })
    ).toEqual(Result.fail(Refusal.InviteNotFound()))
  })
})

const joined = (userId: string, role: 'owner' | 'member', month: string) => ({
  userId,
  role,
  joinedAt: DateTime.makeUnsafe(`2024-${month}-01T00:00:00Z`),
})

const sentTo = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: 'invitation-1',
  invitee: 'sam',
  invitedBy: 'lily',
  status: 'pending',
  expiresAt: DateTime.toDateUtc(DateTime.add(now, { days: 3 })),
  resolvedAt: null,
  ...overrides,
})

const daysAgo = (days: number, lessMs = 0) =>
  DateTime.toDateUtc(
    DateTime.add(DateTime.subtract(now, { days }), { milliseconds: lessMs })
  )

describe('invite', () => {
  const inAWeek = DateTime.add(now, { days: 7 })
  const people = new Map([
    ['alex', account({ userId: 'alex', name: 'Alex' })],
    ['lily', account({ userId: 'lily', name: null })],
    ['sam', account({ userId: 'sam', name: 'Sam', language: 'fr' })],
  ])
  const meeting: Held = { ...atHome, accounts: people }

  const send = (held: Held, by = 'alex', invitee = 'sam') =>
    invite(held, {
      by,
      invitee,
      newInvitationId: 'invitation-new',
      expiresAt: inAWeek,
      now,
    })

  const opened = (id: string, by: string, inviterName: string | null) =>
    Result.succeed(
      decision(
        {
          value: { canopyId: homeId },
          notices: [
            Notice.Invited({
              to: account({ userId: 'sam', name: 'Sam', language: 'fr' }),
              inviterName,
              canopyName: 'Home',
              invitationId: id,
            }),
          ],
        },
        [
          CanopyWrite.OpenInvitation({
            id,
            canopyId: homeId,
            invitee: 'sam',
            invitedBy: by,
            expiresAt: inAWeek,
            at: now,
          }),
        ]
      )
    )

  const quiet = Result.succeed(
    decision({ value: { canopyId: homeId }, notices: [] }, [])
  )

  const fullOf = (held: Held): Held => ({
    ...held,
    canopy: Option.map(held.canopy, (canopy) => ({
      ...canopy,
      members: [
        ...canopy.members,
        ...Array.makeBy(CANOPY_MAX_MEMBERS - canopy.members.length, (n) =>
          joined(`member-${n}`, 'member', '06')
        ),
      ],
    })),
  })

  const unreachable = (userId: string, held: Held): Held => ({
    ...held,
    accounts: new Map([
      ...held.accounts,
      [userId, account({ userId, reachable: false })],
    ]),
  })

  it.each([
    ['the owner', 'alex', 'Alex'],
    ['a plain member, whose name nobody set', 'lily', null],
  ])(
    'lets %s open a new invitation under the id given, and owes the invitee a notice that points at it',
    (_name, by, inviterName) => {
      expect(send(meeting, by)).toEqual(
        opened('invitation-new', by, inviterName)
      )
    }
  )

  it.each([
    ['someone with no canopy', { ...HELD_NOTHING, accounts: people }, 'alex'],
    ['someone who is not a member of the canopy held', meeting, 'sam'],
  ])('refuses %s, before it looks for the invitee', (_name, held, by) => {
    expect(send(held, by, 'nobody')).toEqual(Result.fail(Refusal.NotMember()))
  })

  it.each([
    ['whose account is gone', { ...atHome, accounts: new Map() }, 'sam'],
    ['who cannot be reached', unreachable('sam', meeting), 'sam'],
    [
      'who cannot be reached, though they are a member',
      unreachable('lily', meeting),
      'lily',
    ],
    [
      'whose account is gone, though the canopy is full',
      fullOf({ ...atHome, accounts: new Map() }),
      'sam',
    ],
  ])('answers not found for an invitee %s', (_name, held, invitee) => {
    expect(send(held, 'alex', invitee)).toEqual(
      Result.fail(Refusal.InviteeNotFound({ userId: invitee }))
    )
  })

  it.each([
    ['another member', meeting, 'lily'],
    ['themself', meeting, 'alex'],
    ['a member of a canopy that is full', fullOf(meeting), 'lily'],
  ])('refuses to invite %s', (_name, held, invitee) => {
    expect(send(held, 'alex', invitee)).toEqual(
      Result.fail(Refusal.InviteeAlreadyMember())
    )
  })

  it('refuses once every seat is taken, and invites into the last one', () => {
    const oneSeatLeft: Held = {
      ...meeting,
      canopy: Option.map(fullOf(meeting).canopy, (canopy) => ({
        ...canopy,
        members: Array.dropRight(canopy.members, 1),
      })),
    }

    expect(send(fullOf(meeting))).toEqual(
      Result.fail(Refusal.CanopyFull({ limit: CANOPY_MAX_MEMBERS }))
    )
    expect(send(oneSeatLeft)).toEqual(opened('invitation-new', 'alex', 'Alex'))
  })

  it.each([
    ['their invitation is still open', sentTo()],
    [
      'they declined less than a week ago',
      sentTo({ status: 'declined', resolvedAt: daysAgo(7, 1) }),
    ],
  ])('succeeds, writes nothing and tells nobody while %s', (_name, earlier) => {
    expect(send({ ...meeting, invitations: [earlier] })).toEqual(quiet)
  })

  it.each([
    [
      'they declined a week ago',
      sentTo({ status: 'declined', resolvedAt: daysAgo(7) }),
    ],
    [
      'it was withdrawn a moment ago',
      sentTo({ status: 'withdrawn', resolvedAt: daysAgo(0) }),
    ],
    [
      'they accepted it, then left',
      sentTo({ status: 'accepted', resolvedAt: daysAgo(1) }),
    ],
    ['it lapsed', sentTo({ expiresAt: DateTime.toDateUtc(now) })],
  ])(
    'opens the row the invitee already has again, under its own id, once %s',
    (_name, earlier) => {
      expect(send({ ...meeting, invitations: [earlier] })).toEqual(
        opened('invitation-1', 'alex', 'Alex')
      )
    }
  )

  it('opens a new invitation for an invitee the canopy never invited, whoever else it did', () => {
    const forSomeoneElse = sentTo({ id: 'invitation-2', invitee: 'noor' })

    expect(send({ ...meeting, invitations: [forSomeoneElse] })).toEqual(
      opened('invitation-new', 'alex', 'Alex')
    )
  })
})

describe('withdrawInvitation', () => {
  const withdraw = (held: Held, by: string, invitationId = 'invitation-1') =>
    withdrawInvitation(held, { by, invitationId, now })

  const sent = (overrides: Partial<Invitation> = {}): Held => ({
    ...atHome,
    invitations: [sentTo(overrides)],
  })

  const withdrawn = Result.succeed(
    decision({ canopyId: homeId }, [
      CanopyWrite.ResolveInvitation({
        id: 'invitation-1',
        to: 'withdrawn',
        at: now,
      }),
    ])
  )

  it.each([
    ['someone with no canopy', { ...HELD_NOTHING, invitations: [sentTo()] }],
    ['someone who is not a member of the canopy held', sent()],
  ])('refuses %s', (_name, held) => {
    expect(withdraw(held, 'sam')).toEqual(Result.fail(Refusal.NotMember()))
  })

  it.each([
    ['the member who sent it', 'lily', sent()],
    ['the owner, though a member sent it', 'alex', sent()],
    [
      'its sender once it has lapsed',
      'lily',
      sent({ expiresAt: DateTime.toDateUtc(now) }),
    ],
  ])('lets %s withdraw a pending invitation', (_name, by, held) => {
    expect(withdraw(held, by)).toEqual(withdrawn)
  })

  it.each([
    ['a member who did not send it', 'lily', sent({ invitedBy: 'alex' })],
    ['an invitation the canopy does not hold', 'alex', atHome],
    ['another id than the one held', 'alex', sent({ id: 'invitation-2' })],
    ['an invitation that was accepted', 'alex', sent({ status: 'accepted' })],
    ['an invitation that was declined', 'alex', sent({ status: 'declined' })],
  ])('answers not found for %s', (_name, by, held) => {
    expect(withdraw(held, by)).toEqual(Result.fail(Refusal.InviteNotFound()))
  })

  it('succeeds with no write for an invitation that is already withdrawn', () => {
    expect(withdraw(sent({ status: 'withdrawn' }), 'lily')).toEqual(
      Result.succeed(decision({ canopyId: homeId }, []))
    )
  })
})

describe('declineInvitation', () => {
  const decline = (held: Held, by = 'sam', invitationId = 'invitation-1') =>
    declineInvitation(held, { by, invitationId, now })

  const received = (overrides: Partial<Invitation> = {}): Held => ({
    ...HELD_NOTHING,
    invitations: [sentTo(overrides)],
  })

  it.each([
    ['needs no canopy held', received()],
    ['may have lapsed', received({ expiresAt: DateTime.toDateUtc(now) })],
  ])(
    'lets the invitee decline a pending invitation, which %s, and tells nobody',
    (_name, held) => {
      expect(decline(held)).toEqual(
        Result.succeed(
          decision(undefined, [
            CanopyWrite.ResolveInvitation({
              id: 'invitation-1',
              to: 'declined',
              at: now,
            }),
          ])
        )
      )
    }
  )

  it.each([
    ['the member who sent it', received(), 'lily', 'invitation-1'],
    ['anyone but the invitee', received(), 'noor', 'invitation-1'],
    ['an invitation that is not held', HELD_NOTHING, 'sam', 'invitation-1'],
    ['another id than the one held', received(), 'sam', 'invitation-2'],
    [
      'an invitation that was withdrawn',
      received({ status: 'withdrawn' }),
      'sam',
      'invitation-1',
    ],
    [
      'an invitation that was accepted',
      received({ status: 'accepted' }),
      'sam',
      'invitation-1',
    ],
  ])('answers not found for %s', (_name, held, by, invitationId) => {
    expect(decline(held, by, invitationId)).toEqual(
      Result.fail(Refusal.InviteNotFound())
    )
  })

  it('succeeds with no write for an invitation that is already declined', () => {
    expect(decline(received({ status: 'declined' }))).toEqual(
      Result.succeed(decision(undefined, []))
    )
  })
})

const ofAlex: PlantOwner = { _tag: 'User', userId: 'alex' }
const ofLily: PlantOwner = { _tag: 'User', userId: 'lily' }
const ofHome: PlantOwner = { _tag: 'Canopy', canopyId: homeId }
const ofCabin: PlantOwner = {
  _tag: 'Canopy',
  canopyId: CanopyId.make('canopy-2'),
}

const atLimit = new LimitExceededError({
  feature: 'plants',
  limit: 5,
  current: 5,
  message: 'Plant limit reached',
})
const free: MoveFacts = { inOpenDelegation: false, overLimit: Option.none() }
const full: MoveFacts = { ...free, overLimit: Option.some(atLimit) }

const moving = (plant: HeldPlant, given: Partial<Held> = {}): Held => ({
  ...atHome,
  plants: [plant],
  ...given,
})

describe('sharePlant', () => {
  const fern: HeldPlant = {
    id: 'fern',
    owner: ofAlex,
    sharer: Option.some('alex'),
    living: true,
  }

  const share = (
    held: Held,
    given: { by?: string; room?: Placement; facts?: MoveFacts } = {}
  ) =>
    sharePlant(held, {
      by: given.by ?? 'alex',
      plantId: 'fern',
      room: given.room ?? RoomMove.Clear(),
      facts: given.facts ?? free,
    })

  const sharedInto = (to: RoomMove) =>
    Result.succeed(
      decision(
        undefined,
        [
          CanopyWrite.MovePlants({
            plantIds: ['fern'],
            from: ofAlex,
            to: ofHome,
            room: to,
          }),
        ],
        [{ _tag: 'PlantsMoved', plantIds: ['fern'], from: ofAlex, to: ofHome }]
      )
    )

  it("moves the member's own plant to their canopy, out of its room, and says who owned it and who owns it", () => {
    expect(share(moving(fern))).toEqual(sharedInto(RoomMove.Clear()))
  })

  it('lets a plain member share a plant of their own', () => {
    expect(
      Result.map(
        share(moving({ ...fern, owner: ofLily }), { by: 'lily' }),
        ({ writes }) => writes
      )
    ).toEqual(
      Result.succeed([
        CanopyWrite.MovePlants({
          plantIds: ['fern'],
          from: ofLily,
          to: ofHome,
          room: RoomMove.Clear(),
        }),
      ])
    )
  })

  it('puts the plant in a room of the canopy', () => {
    const kitchen = RoomMove.Put({ roomId: 'kitchen' })

    expect(
      share(moving(fern, { rooms: [{ id: 'kitchen', owner: ofHome }] }), {
        room: kitchen,
      })
    ).toEqual(sharedInto(kitchen))
  })

  it.each([
    ['who has no canopy', { ...moving(fern), canopy: Option.none() }, 'alex'],
    ['who is not a member of the canopy held', moving(fern), 'sam'],
  ])('refuses someone %s, before it looks at the plant', (_, held, by) => {
    expect(
      share(held, { by, facts: { ...full, inOpenDelegation: true } })
    ).toEqual(Result.fail(Refusal.NotMember()))
  })

  it('refuses a plant in an open delegation, before it looks for the plant', () => {
    expect(
      share(
        { ...atHome, plants: [] },
        { facts: { ...free, inOpenDelegation: true } }
      )
    ).toEqual(Result.fail(Refusal.PlantInDelegation({ plantId: 'fern' })))
  })

  it.each([
    ['that is gone', []],
    ['that someone else owns by now', [{ ...fern, owner: ofLily }]],
    ['that the canopy already holds', [{ ...fern, owner: ofHome }]],
  ])('refuses a plant %s', (_, plants) => {
    expect(share({ ...atHome, plants })).toEqual(
      Result.fail(Refusal.PlantGone({ plantId: 'fern' }))
    )
  })

  it.each([
    ['that is gone', []],
    ["that is the member's own", [{ id: 'kitchen', owner: ofAlex }]],
    ['of another canopy', [{ id: 'kitchen', owner: ofCabin }]],
  ])('refuses a room %s, before it looks at the limit', (_, rooms) => {
    expect(
      share(moving(fern, { rooms }), {
        room: RoomMove.Put({ roomId: 'kitchen' }),
        facts: full,
      })
    ).toEqual(Result.fail(Refusal.RoomNotFound({ roomId: 'kitchen' })))
  })

  it('refuses a living plant when the canopy is at its limit, with the reason the limit gave', () => {
    expect(share(moving(fern), { facts: full })).toEqual(
      Result.fail(Refusal.OverLimit({ error: atLimit }))
    )
  })

  it('shares a dead plant into a canopy at its limit', () => {
    expect(
      Result.isSuccess(
        share(moving({ ...fern, living: false }), { facts: full })
      )
    ).toBe(true)
  })
})

describe('unsharePlant', () => {
  const sharedBy = (sharer: Option.Option<string>): HeldPlant => ({
    id: 'cactus',
    owner: ofHome,
    sharer,
    living: true,
  })
  const ofLilyShared = sharedBy(Option.some('lily'))
  const ofSomeoneWhoLeft = sharedBy(Option.some('sam'))
  const ofADeletedAccount = sharedBy(Option.none())

  const unshare = (
    held: Held,
    given: {
      by?: string
      room?: Placement
      facts?: Pick<MoveFacts, 'overLimit'>
    } = {}
  ) =>
    unsharePlant(held, {
      by: given.by ?? 'lily',
      plantId: 'cactus',
      room: given.room ?? RoomMove.Clear(),
      facts: given.facts ?? free,
    })

  const takenBy = (userId: string, to: RoomMove = RoomMove.Clear()) => {
    const receiver: PlantOwner = { _tag: 'User', userId }
    return Result.succeed(
      decision(
        undefined,
        [
          CanopyWrite.MovePlants({
            plantIds: ['cactus'],
            from: ofHome,
            to: receiver,
            room: to,
          }),
        ],
        [
          {
            _tag: 'PlantsMoved',
            plantIds: ['cactus'],
            from: ofHome,
            to: receiver,
          },
        ]
      )
    )
  }

  it('gives a plant back to the member who shared it, out of its room', () => {
    expect(unshare(moving(ofLilyShared))).toEqual(takenBy('lily'))
  })

  it("puts the plant in one of the receiver's own rooms", () => {
    const desk = RoomMove.Put({ roomId: 'desk' })

    expect(
      unshare(
        moving(ofLilyShared, { rooms: [{ id: 'desk', owner: ofLily }] }),
        {
          room: desk,
        }
      )
    ).toEqual(takenBy('lily', desk))
  })

  it('refuses the canopy owner a plant whose sharer is still a member', () => {
    expect(unshare(moving(ofLilyShared), { by: 'alex' })).toEqual(
      Result.fail(Refusal.PlantNotYours())
    )
  })

  it.each([
    ['has left the canopy', ofSomeoneWhoLeft],
    ['no longer has an account', ofADeletedAccount],
  ])(
    'gives the canopy owner, and not the sharer, a plant whose sharer %s',
    (_, plant) => {
      expect(unshare(moving(plant), { by: 'alex' })).toEqual(takenBy('alex'))
    }
  )

  it.each([
    ['has left the canopy', ofSomeoneWhoLeft],
    ['no longer has an account', ofADeletedAccount],
  ])('refuses a plain member a plant whose sharer %s', (_, plant) => {
    expect(unshare(moving(plant))).toEqual(Result.fail(Refusal.PlantNotYours()))
  })

  it.each([
    [
      'who has no canopy',
      { ...moving(ofLilyShared), canopy: Option.none() },
      'lily',
    ],
    ['who is not a member of the canopy held', moving(ofLilyShared), 'sam'],
  ])('refuses someone %s', (_, held, by) => {
    expect(unshare(held, { by })).toEqual(Result.fail(Refusal.NotMember()))
  })

  it('answers not a member for a plant of another canopy', () => {
    expect(unshare(moving({ ...ofLilyShared, owner: ofCabin }))).toEqual(
      Result.fail(Refusal.NotMember())
    )
  })

  it.each([
    ['that is gone', []],
    ['that a user owns by now', [{ ...ofLilyShared, owner: ofLily }]],
  ])('refuses a plant %s', (_, plants) => {
    expect(unshare({ ...atHome, plants })).toEqual(
      Result.fail(Refusal.PlantGone({ plantId: 'cactus' }))
    )
  })

  it.each([
    ['that is gone', []],
    ['of the canopy', [{ id: 'desk', owner: ofHome }]],
    ['of another member', [{ id: 'desk', owner: ofAlex }]],
  ])('refuses a room %s, before it looks at the limit', (_, rooms) => {
    expect(
      unshare(moving(ofLilyShared, { rooms }), {
        room: RoomMove.Put({ roomId: 'desk' }),
        facts: full,
      })
    ).toEqual(Result.fail(Refusal.RoomNotFound({ roomId: 'desk' })))
  })

  it('refuses a living plant when the receiver is at their limit, with the reason the limit gave', () => {
    expect(unshare(moving(ofLilyShared), { facts: full })).toEqual(
      Result.fail(Refusal.OverLimit({ error: atLimit }))
    )
  })

  it('gives a dead plant back to a receiver at their limit', () => {
    expect(
      unshare(moving({ ...ofLilyShared, living: false }), { facts: full })
    ).toEqual(takenBy('lily'))
  })
})

describe('setMute', () => {
  const cactus: HeldPlant = {
    id: 'cactus',
    owner: ofHome,
    sharer: Option.some('alex'),
    living: true,
  }
  const lilyOnCactus = { userId: 'lily', plantId: 'cactus' }

  const mute = (held: Held, by = 'lily', muted = true) =>
    setMute(held, { by, plantId: 'cactus', muted })

  it.each([
    ['someone with no canopy', { ...HELD_NOTHING, plants: [cactus] }, 'lily'],
    ['someone who is not a member of the canopy held', moving(cactus), 'sam'],
    ['a plant that is gone', atHome, 'lily'],
    [
      'a plant a user owns by now',
      moving({ ...cactus, owner: ofLily }),
      'lily',
    ],
    [
      'a plant of another canopy',
      moving({ ...cactus, owner: ofCabin }),
      'lily',
    ],
  ])('answers that the plant is gone to %s', (_name, held, by) => {
    expect([mute(held, by, true), mute(held, by, false)]).toEqual(
      Array.replicate(Result.fail(Refusal.PlantGone({ plantId: 'cactus' })), 2)
    )
  })

  it.each([
    ['the owner', 'alex'],
    ['a plain member', 'lily'],
  ])('mutes a plant of the canopy for %s alone, and says so', (_name, by) => {
    const mine = { userId: by, plantId: 'cactus' }

    expect(mute(moving(cactus), by)).toEqual(
      Result.succeed(
        decision(
          undefined,
          [CanopyWrite.Mute(mine)],
          [{ _tag: 'PlantMuted', ...mine }]
        )
      )
    )
  })

  it('unmutes with one write and says so, whether or not the plant was muted', () => {
    expect(mute(moving(cactus), 'lily', false)).toEqual(
      Result.succeed(
        decision(
          undefined,
          [CanopyWrite.Unmute(lilyOnCactus)],
          [{ _tag: 'PlantUnmuted', ...lilyOnCactus }]
        )
      )
    )
  })

  it('mutes a dead plant as a living one', () => {
    expect(
      Result.map(
        mute(moving({ ...cactus, living: false })),
        ({ writes }) => writes
      )
    ).toEqual(Result.succeed([CanopyWrite.Mute(lilyOnCactus)]))
  })
})

const household: CanopyState = {
  ...home,
  members: [
    joined('alex', 'owner', '01'),
    joined('sam', 'member', '03'),
    joined('lily', 'member', '06'),
  ],
}

const handedOver: CanopyState = {
  ...home,
  members: [
    joined('sam', 'member', '01'),
    joined('alex', 'owner', '03'),
    joined('lily', 'member', '06'),
  ],
}

const ofSam: PlantOwner = { _tag: 'User', userId: 'sam' }

const inHome = (id: string, sharer: Option.Option<string>): HeldPlant => ({
  id,
  owner: ofHome,
  sharer,
  living: true,
})

const garden: ReadonlyArray<HeldPlant> = [
  inHome('aloe-of-alex', Option.some('alex')),
  inHome('basil-of-sam', Option.some('sam')),
  inHome('cactus-of-lily', Option.some('lily')),
  { ...inHome('dead-fern-of-lily', Option.some('lily')), living: false },
  inHome('elm-of-a-deleted-account', Option.none()),
  inHome('fig-of-someone-who-left', Option.some('noor')),
]

const people = new Map(
  Array.map(['alex', 'sam', 'lily'], (userId) => [
    userId,
    account({ userId, name: `${userId} the gardener`, language: 'fr' }),
  ])
)

const living = (canopy: CanopyState, given: Partial<Held> = {}): Held => ({
  ...HELD_NOTHING,
  canopy: Option.some(canopy),
  accounts: people,
  plants: garden,
  rooms: [
    { id: 'kitchen', owner: ofHome },
    { id: 'porch', owner: ofHome },
  ],
  ...given,
})

const goneFromHome = (userId: string) => [
  CanopyWrite.RemoveMember({ canopyId: homeId, userId }),
  CanopyWrite.WithdrawInvitationsSentBy({
    canopyId: homeId,
    userId,
    at: now,
  }),
]

const backToLily = {
  write: CanopyWrite.MovePlants({
    plantIds: ['cactus-of-lily', 'dead-fern-of-lily'],
    from: ofHome,
    to: ofLily,
    room: RoomMove.Clear(),
  }),
  event: {
    _tag: 'PlantsMoved',
    plantIds: ['cactus-of-lily', 'dead-fern-of-lily'],
    from: ofHome,
    to: ofLily,
  },
} as const

const dissolvedInto = (
  heir: string,
  plantIds: readonly [string, ...string[]],
  returned: ReadonlyArray<readonly [PlantOwner, readonly [string, ...string[]]]>
) => ({
  writes: [
    ...Array.map(returned, ([to, ids]) =>
      CanopyWrite.MovePlants({
        plantIds: ids,
        from: ofHome,
        to,
        room: RoomMove.Clear(),
      })
    ),
    CanopyWrite.MoveRooms({
      roomIds: ['kitchen', 'porch'],
      canopyId: homeId,
      toUserId: heir,
    }),
    CanopyWrite.MovePlants({
      plantIds,
      from: ofHome,
      to: { _tag: 'User', userId: heir },
      room: RoomMove.Keep(),
    }),
    CanopyWrite.DeleteCanopy({ canopyId: homeId }),
  ],
  events: [
    ...Array.map(returned, ([to, ids]) => ({
      _tag: 'PlantsMoved' as const,
      plantIds: ids,
      from: ofHome,
      to,
    })),
    {
      _tag: 'PlantsMoved' as const,
      plantIds,
      from: ofHome,
      to: { _tag: 'User' as const, userId: heir },
    },
    { _tag: 'CanopyDissolved' as const, canopyId: homeId },
  ],
})

describe('leave', () => {
  const leaving = (
    held: Held,
    by: string,
    given: Partial<Parameters<typeof leave>[1]> = {}
  ) => leave(held, { by, plants: 'return', reason: 'left', now, ...given })

  it.each([
    ['someone with no canopy', HELD_NOTHING],
    ['someone who is not a member of the canopy held', living(household)],
  ])('refuses %s', (_name, held) => {
    expect(leaving(held, 'noor')).toEqual(Result.fail(Refusal.NotMember()))
  })

  it('gives a leaving member exactly the plants they shared, dead ones too, out of their rooms, then ends the membership, their invitations and their link, and tells the owner', () => {
    expect(leaving(living(household), 'lily')).toEqual(
      Result.succeed(
        decision(
          {
            value: 'left',
            notices: [
              Notice.MemberLeft({
                to: account({
                  userId: 'alex',
                  name: 'alex the gardener',
                  language: 'fr',
                }),
                leaverName: 'lily the gardener',
                canopyName: 'Home',
              }),
            ],
          },
          [
            backToLily.write,
            ...goneFromHome('lily'),
            CanopyWrite.RevokeLinks({
              canopyId: homeId,
              onlyCreatedBy: Option.some('lily'),
              at: now,
            }),
          ],
          [
            backToLily.event,
            {
              _tag: 'MemberLeft',
              canopyId: homeId,
              userId: 'lily',
              reason: 'left',
            },
          ]
        )
      )
    )
  })

  it('keeps the owner an owner when a member leaves, though another member joined before them', () => {
    const decided = leaving(living(handedOver), 'lily')

    expect(
      Result.map(decided, ({ writes }) =>
        Array.filter(writes, CanopyWrite.$is('SetOwner'))
      )
    ).toEqual(Result.succeed([]))
    expect(
      Result.map(decided, ({ outcome }) =>
        Array.map(outcome.notices, (notice) => notice.to.userId)
      )
    ).toEqual(Result.succeed(['alex']))
  })

  it('makes the earliest joiner the owner once the owner is gone, as the last write, and tells them', () => {
    const decided = leaving(living(handedOver, { plants: [] }), 'alex')

    expect(Result.map(decided, ({ writes }) => writes)).toEqual(
      Result.succeed([
        ...goneFromHome('alex'),
        CanopyWrite.RevokeLinks({
          canopyId: homeId,
          onlyCreatedBy: Option.some('alex'),
          at: now,
        }),
        CanopyWrite.SetOwner({ canopyId: homeId, userId: 'sam' }),
      ])
    )
    expect(
      Result.map(decided, ({ outcome }) =>
        Array.map(outcome.notices, (notice) => notice.to.userId)
      )
    ).toEqual(Result.succeed(['sam']))
  })

  it('makes the earliest joiner the owner in whatever order the members are held', () => {
    const lastJoinerFirst: CanopyState = {
      ...handedOver,
      members: Array.reverse(handedOver.members),
    }

    expect(
      Result.map(
        leaving(living(lastJoinerFirst, { plants: [] }), 'alex'),
        ({ writes }) => Array.filter(writes, CanopyWrite.$is('SetOwner'))
      )
    ).toEqual(
      Result.succeed([
        CanopyWrite.SetOwner({ canopyId: homeId, userId: 'sam' }),
      ])
    )
  })

  it('leaves every plant in the canopy when the plants stay, and says why the member left', () => {
    const decided = leaving(living(household), 'lily', {
      plants: 'stay',
      reason: 'accountDeleted',
    })

    expect(
      Result.map(decided, ({ writes, events }) => ({ writes, events }))
    ).toEqual(
      Result.succeed({
        writes: [
          ...goneFromHome('lily'),
          CanopyWrite.RevokeLinks({
            canopyId: homeId,
            onlyCreatedBy: Option.some('lily'),
            at: now,
          }),
        ],
        events: [
          {
            _tag: 'MemberLeft',
            canopyId: homeId,
            userId: 'lily',
            reason: 'accountDeleted',
          },
        ],
      })
    )
  })

  it.each(['return', 'stay'] as const)(
    'dissolves the canopy into its last member, who takes every plant in its room and the rooms, and owes nobody a notice (plants: %s)',
    (plants) => {
      const alone: CanopyState = {
        ...home,
        members: [joined('alex', 'owner', '01')],
      }

      const { writes, events } = dissolvedInto(
        'alex',
        [
          'aloe-of-alex',
          'basil-of-sam',
          'cactus-of-lily',
          'dead-fern-of-lily',
          'elm-of-a-deleted-account',
          'fig-of-someone-who-left',
        ],
        []
      )

      expect(leaving(living(alone), 'alex', { plants })).toEqual(
        Result.succeed(
          decision({ value: 'dissolved', notices: [] }, writes, events)
        )
      )
    }
  )
})

describe('removeMember', () => {
  const removing = (held: Held, by: string, target: string) =>
    removeMember(held, { by, target, now })

  it.each([
    ['someone with no canopy', HELD_NOTHING],
    ['someone who is not a member of the canopy held', living(household)],
  ])('refuses %s', (_name, held) => {
    expect(removing(held, 'noor', 'lily')).toEqual(
      Result.fail(Refusal.NotMember())
    )
  })

  it('refuses a member who is not the owner', () => {
    expect(removing(living(household), 'sam', 'lily')).toEqual(
      Result.fail(Refusal.NotOwner())
    )
  })

  it.each([
    ['the owner themself', 'alex'],
    ['someone who is not a member', 'noor'],
  ])('finds no member to remove in %s', (_name, target) => {
    expect(removing(living(household), 'alex', target)).toEqual(
      Result.fail(Refusal.MemberNotFound())
    )
  })

  it('gives the removed member their plants back, ends their membership and invitations, revokes the link whoever made it, and tells them', () => {
    expect(removing(living(household), 'alex', 'lily')).toEqual(
      Result.succeed(
        decision(
          {
            value: { canopyId: homeId },
            notices: [
              Notice.MemberRemoved({
                to: account({
                  userId: 'lily',
                  name: 'lily the gardener',
                  language: 'fr',
                }),
                canopyName: 'Home',
              }),
            ],
          },
          [
            backToLily.write,
            ...goneFromHome('lily'),
            CanopyWrite.RevokeLinks({
              canopyId: homeId,
              onlyCreatedBy: Option.none(),
              at: now,
            }),
          ],
          [
            backToLily.event,
            {
              _tag: 'MemberLeft',
              canopyId: homeId,
              userId: 'lily',
              reason: 'removed',
            },
          ]
        )
      )
    )
  })
})

describe('dissolve', () => {
  it.each([
    ['someone with no canopy', HELD_NOTHING, Refusal.NotMember()],
    [
      'someone who is not a member of the canopy held',
      living(household),
      Refusal.NotMember(),
    ],
  ])('refuses %s', (_name, held, refusal) => {
    expect(dissolve(held, { by: 'noor' })).toEqual(Result.fail(refusal))
  })

  it('refuses a member who is not the owner', () => {
    expect(dissolve(living(household), { by: 'lily' })).toEqual(
      Result.fail(Refusal.NotOwner())
    )
  })

  it('gives each other member the plants they shared with no room, in join order, then the owner the rooms and every other plant, and deletes the canopy last', () => {
    const { writes, events } = dissolvedInto(
      'alex',
      ['aloe-of-alex', 'elm-of-a-deleted-account', 'fig-of-someone-who-left'],
      [
        [ofSam, ['basil-of-sam']],
        [ofLily, ['cactus-of-lily', 'dead-fern-of-lily']],
      ]
    )

    expect(dissolve(living(handedOver), { by: 'alex' })).toEqual(
      Result.succeed(decision(undefined, writes, events))
    )
  })

  it('only deletes a canopy that holds no plant and no room', () => {
    expect(
      dissolve(living(household, { plants: [], rooms: [] }), { by: 'alex' })
    ).toEqual(
      Result.succeed(
        decision(
          undefined,
          [CanopyWrite.DeleteCanopy({ canopyId: homeId })],
          [{ _tag: 'CanopyDissolved', canopyId: homeId }]
        )
      )
    )
  })
})
