import {
  type CanopyState,
  type Held,
  type Invitation,
  memberOf,
} from '@lily/api/contexts/canopy/domain/canopy'
import {
  type Admission,
  admissionOf,
  planInvitation,
} from '@lily/api/contexts/canopy/domain/invitation'
import {
  acting,
  CanopyWrite,
  type Decided,
  may,
  Notice,
  Refusal,
  type RefusalOf,
  seatOf,
} from '@lily/api/contexts/canopy/domain/vocabulary'
import { decision } from '@lily/api/kernel/transact'
import { CANOPY_MAX_MEMBERS, type CanopyId } from '@lily/shared'
import { Array, Data, DateTime, Option, pipe, Result } from 'effect'

export type Entry = Data.TaggedEnum<{
  Link: { readonly tokenHash: string }
  Invitation: { readonly invitationId: string }
}>
export const Entry = Data.taggedEnum<Entry>()

type EntryRefusal = RefusalOf<'InviteNotFound' | 'InviteExpired'>

interface Pass {
  readonly spendsInvitation: Option.Option<string>
  readonly readmitsOnly: boolean
}

interface Door extends Pass {
  readonly canopy: CanopyState
}

const passOf = (pass: Pass): Result.Result<Pass, EntryRefusal> =>
  Result.succeed(pass)

const noEntry = (refusal: EntryRefusal): Result.Result<Pass, EntryRefusal> =>
  Result.fail(refusal)

const PASS_OF_INVITATION: Record<
  Admission,
  (invitationId: string) => Result.Result<Pass, EntryRefusal>
> = {
  open: (invitationId) =>
    passOf({
      spendsInvitation: Option.some(invitationId),
      readmitsOnly: false,
    }),
  spent: () => passOf({ spendsInvitation: Option.none(), readmitsOnly: true }),
  expired: () => noEntry(Refusal.InviteExpired()),
  gone: () => noEntry(Refusal.InviteNotFound()),
}

const passOfLink = (
  canopy: CanopyState,
  tokenHash: string,
  now: DateTime.Utc
): Result.Result<Pass, EntryRefusal> =>
  Option.match(
    Option.filter(canopy.link, (link) => link.tokenHash === tokenHash),
    {
      onNone: () => noEntry(Refusal.InviteNotFound()),
      onSome: (link) =>
        DateTime.isGreaterThan(link.expiresAt, now)
          ? passOf({ spendsInvitation: Option.none(), readmitsOnly: false })
          : noEntry(Refusal.InviteExpired()),
    }
  )

const passOfInvitation = (
  held: Held,
  joiner: string,
  invitationId: string,
  now: DateTime.Utc
): Result.Result<Pass, EntryRefusal> =>
  Option.match(
    Array.findFirst(
      held.invitations,
      (invitation) =>
        invitation.id === invitationId && invitation.invitee === joiner
    ),
    {
      onNone: () => noEntry(Refusal.InviteNotFound()),
      onSome: (invitation) =>
        PASS_OF_INVITATION[admissionOf(invitation, now)](invitation.id),
    }
  )

const doorOf = (
  held: Held,
  joiner: string,
  via: Entry,
  now: DateTime.Utc
): Result.Result<Door, EntryRefusal> =>
  Result.flatMap(
    Result.fromOption(held.canopy, () => Refusal.InviteNotFound()),
    (canopy) =>
      Result.map(
        Entry.$match(via, {
          Link: ({ tokenHash }) => passOfLink(canopy, tokenHash, now),
          Invitation: ({ invitationId }) =>
            passOfInvitation(held, joiner, invitationId, now),
        }),
        (pass) => ({ canopy, ...pass })
      )
  )

export const join = (
  held: Held,
  command: {
    readonly joiner: string
    readonly via: Entry
    readonly now: DateTime.Utc
  }
): Decided<
  { readonly canopyId: CanopyId },
  'InviteNotFound' | 'InviteExpired' | 'AlreadyInCanopy' | 'CanopyFull'
> =>
  Result.gen(function* () {
    const { joiner, now } = command
    const { canopy, spendsInvitation, readmitsOnly } = yield* doorOf(
      held,
      joiner,
      command.via,
      now
    )
    const spent = Array.map(Option.toArray(spendsInvitation), (id) =>
      CanopyWrite.ResolveInvitation({ id, to: 'accepted', at: now })
    )
    if (Option.isSome(memberOf(canopy, joiner))) {
      return decision({ canopyId: canopy.id }, spent)
    }
    const elsewhere = Option.filter(
      held.actorCanopy,
      (current) => current.canopyId !== canopy.id
    )
    if (Option.isSome(elsewhere)) {
      return yield* Result.fail(
        Refusal.AlreadyInCanopy({ canopyName: elsewhere.value.name })
      )
    }
    const account = yield* Result.fromNullishOr(held.accounts.get(joiner), () =>
      Refusal.InviteNotFound()
    )
    if (readmitsOnly) return yield* Result.fail(Refusal.InviteNotFound())
    if (canopy.members.length >= CANOPY_MAX_MEMBERS) {
      return yield* Result.fail(
        Refusal.CanopyFull({ limit: CANOPY_MAX_MEMBERS })
      )
    }
    return decision(
      { canopyId: canopy.id },
      [
        CanopyWrite.AddMember({
          canopyId: canopy.id,
          userId: joiner,
          role: 'member',
          at: now,
        }),
        ...spent,
      ],
      [{ _tag: 'MemberJoined', canopyId: canopy.id, userId: joiner }],
      pipe(
        canopy.members,
        Array.flatMap((member) =>
          Option.toArray(Option.fromNullishOr(held.accounts.get(member.userId)))
        ),
        Array.map((to) =>
          Notice.MemberJoined({
            to,
            joinerName: account.name,
            canopyName: canopy.name,
          })
        )
      )
    )
  })

export const invite = (
  held: Held,
  command: {
    readonly by: string
    readonly invitee: string
    readonly newInvitationId: string
    readonly expiresAt: DateTime.Utc
    readonly now: DateTime.Utc
  }
): Decided<
  { readonly canopyId: CanopyId },
  'NotMember' | 'InviteeNotFound' | 'InviteeAlreadyMember' | 'CanopyFull'
> =>
  Result.gen(function* () {
    const { by, now } = command
    const { canopy } = yield* acting(held, by, ['invite'])
    const invitee = yield* Result.fromOption(
      Option.filter(
        Option.fromNullishOr(held.accounts.get(command.invitee)),
        (account) => account.reachable
      ),
      () => Refusal.InviteeNotFound({ userId: command.invitee })
    )
    if (Option.isSome(memberOf(canopy, invitee.userId))) {
      return yield* Result.fail(Refusal.InviteeAlreadyMember())
    }
    if (canopy.members.length >= CANOPY_MAX_MEMBERS) {
      return yield* Result.fail(
        Refusal.CanopyFull({ limit: CANOPY_MAX_MEMBERS })
      )
    }
    const earlier = Array.findFirst(
      held.invitations,
      (invitation) => invitation.invitee === invitee.userId
    )
    const value = { canopyId: canopy.id }
    if (planInvitation(Option.getOrNull(earlier), now) !== 'send') {
      return decision(value, [])
    }
    const id = Option.match(earlier, {
      onNone: () => command.newInvitationId,
      onSome: (invitation) => invitation.id,
    })
    return decision(
      value,
      [
        CanopyWrite.OpenInvitation({
          id,
          canopyId: canopy.id,
          invitee: invitee.userId,
          invitedBy: by,
          expiresAt: command.expiresAt,
          at: now,
        }),
      ],
      [],
      [
        Notice.Invited({
          to: invitee,
          inviterName: pipe(
            Option.fromNullishOr(held.accounts.get(by)),
            Option.flatMapNullishOr((account) => account.name),
            Option.getOrNull
          ),
          canopyName: canopy.name,
          invitationId: id,
        }),
      ]
    )
  })

const resolving = (
  invitation: Invitation,
  to: 'withdrawn' | 'declined',
  now: DateTime.Utc
): Result.Result<ReadonlyArray<CanopyWrite>, RefusalOf<'InviteNotFound'>> => {
  if (invitation.status === to) return Result.succeed([])
  return invitation.status === 'pending'
    ? Result.succeed([
        CanopyWrite.ResolveInvitation({ id: invitation.id, to, at: now }),
      ])
    : Result.fail(Refusal.InviteNotFound())
}

export const withdrawInvitation = (
  held: Held,
  command: {
    readonly by: string
    readonly invitationId: string
    readonly now: DateTime.Utc
  }
): Decided<{ readonly canopyId: CanopyId }, 'NotMember' | 'InviteNotFound'> =>
  Result.gen(function* () {
    const { by, invitationId, now } = command
    const { canopy, member } = yield* seatOf(held, by)
    const invitation = yield* Result.fromOption(
      Array.findFirst(
        held.invitations,
        (candidate) =>
          candidate.id === invitationId &&
          may(
            member,
            candidate.invitedBy === by
              ? 'withdrawOwnInvitation'
              : 'withdrawInvitationOfMember'
          )
      ),
      () => Refusal.InviteNotFound()
    )
    return decision(
      { canopyId: canopy.id },
      yield* resolving(invitation, 'withdrawn', now)
    )
  })

export const declineInvitation = (
  held: Held,
  command: {
    readonly by: string
    readonly invitationId: string
    readonly now: DateTime.Utc
  }
): Decided<void, 'InviteNotFound'> =>
  Result.gen(function* () {
    const { by, invitationId, now } = command
    const invitation = yield* Result.fromOption(
      Array.findFirst(
        held.invitations,
        (candidate) => candidate.id === invitationId && candidate.invitee === by
      ),
      () => Refusal.InviteNotFound()
    )
    return decision(undefined, yield* resolving(invitation, 'declined', now))
  })
