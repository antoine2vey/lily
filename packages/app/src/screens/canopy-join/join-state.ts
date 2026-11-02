import {
  CANOPY_MAX_MEMBERS,
  type Canopy,
  type CanopyId,
  type CanopyInvitationView,
  type CanopyInvitePreview,
  type CanopyResponse,
} from '@lily/shared'
import { Match, Option, pipe, Result, Schema } from 'effect'
import type { InviteToken } from '@/utils/canopy-invite-token'
import type { ApiFailure, ApiResult } from '@/utils/client'

export type JoinSource =
  | { readonly _tag: 'Link'; readonly token: InviteToken }
  | { readonly _tag: 'Invitation'; readonly id: string }

const parseInvitationId = Schema.decodeUnknownOption(
  Schema.String.check(Schema.isGUID())
)

export const invitationSource = (rawId: string | undefined) =>
  Option.map(
    parseInvitationId(rawId),
    (id): JoinSource => ({ _tag: 'Invitation', id })
  )

export const invitationIdOf = (source: Option.Option<JoinSource>) =>
  Option.flatMap(source, (s) =>
    s._tag === 'Invitation' ? Option.some(s.id) : Option.none()
  )

export type JoinOffer =
  | { readonly _tag: 'Link'; readonly preview: CanopyInvitePreview }
  | { readonly _tag: 'Invitation'; readonly preview: CanopyInvitationView }

/** What the user last asked the join screen to do, and how it ended. */
export type JoinAttempt =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Working' }
  | { readonly _tag: 'Joined'; readonly canopyName: string }
  | { readonly _tag: 'Refused'; readonly error: ApiFailure }

export type JoinScreen =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Invalid' }
  | { readonly _tag: 'Expired' }
  | { readonly _tag: 'Closed' }
  | { readonly _tag: 'Unavailable' }
  | {
      readonly _tag: 'Ready'
      readonly preview: CanopyInvitePreview
      readonly busy: boolean
      readonly failed: boolean
    }
  | {
      readonly _tag: 'AlreadyHere'
      readonly preview: CanopyInvitePreview
      readonly busy: boolean
    }
  | {
      readonly _tag: 'InAnotherCanopy'
      readonly preview: CanopyInvitePreview
      readonly currentName: string
      readonly busy: boolean
    }
  | {
      readonly _tag: 'Full'
      readonly preview: CanopyInvitePreview
      readonly limit: number
    }
  | { readonly _tag: 'PickPlants'; readonly canopyName: string }

export interface JoinInputs {
  readonly source: Option.Option<JoinSource>
  /** `undefined` while the preview loads. */
  readonly offer: ApiResult<JoinOffer> | undefined
  /** `undefined` while the caller's own Canopy loads. */
  readonly mine: ApiResult<CanopyResponse> | undefined
  readonly attempt: JoinAttempt
}

const notFound = (source: JoinSource): JoinScreen =>
  source._tag === 'Invitation' ? { _tag: 'Closed' } : { _tag: 'Invalid' }

const fromPreviewError = (error: ApiFailure, source: JoinSource): JoinScreen =>
  pipe(
    Match.value(error._tag),
    Match.when('CanopyInviteNotFoundError', () => notFound(source)),
    Match.when(
      'CanopyInviteExpiredError',
      (): JoinScreen => ({
        _tag: 'Expired',
      })
    ),
    Match.orElse((): JoinScreen => ({ _tag: 'Unavailable' }))
  )

/**
 * Leaving first is safe only if the accept can still succeed, so a Canopy the
 * preview already counts as full never offers the switch.
 */
const switchOrFull = (
  preview: CanopyInvitePreview,
  currentName: string,
  busy: boolean
): JoinScreen =>
  preview.memberCount >= CANOPY_MAX_MEMBERS
    ? { _tag: 'Full', preview, limit: CANOPY_MAX_MEMBERS }
    : { _tag: 'InAnotherCanopy', preview, currentName, busy }

const fromAcceptError = (
  error: ApiFailure,
  preview: CanopyInvitePreview,
  source: JoinSource
): JoinScreen =>
  pipe(
    Match.value(error),
    Match.tag('CanopyInviteNotFoundError', 'CanopyNotFoundError', () =>
      notFound(source)
    ),
    Match.tag(
      'CanopyInviteExpiredError',
      (): JoinScreen => ({ _tag: 'Expired' })
    ),
    Match.tag(
      'AlreadyInCanopyError',
      ({ canopyName }): JoinScreen => switchOrFull(preview, canopyName, false)
    ),
    Match.tag(
      'CanopyFullError',
      ({ limit }): JoinScreen => ({ _tag: 'Full', preview, limit })
    ),
    Match.orElse(
      (): JoinScreen => ({ _tag: 'Ready', preview, busy: false, failed: true })
    )
  )

/**
 * A link preview names the Canopy but not its id, so a member whose Canopy has
 * the invite's name is treated as already in it. Their only action re-sends
 * the accept, which the API answers with `AlreadyInCanopyError` when the
 * Canopy is a different one, so a name clash never joins or leaves anything.
 */
const isOffered = (offer: JoinOffer, current: Canopy): boolean =>
  pipe(
    Match.value(offer),
    Match.tag('Link', ({ preview }) => current.name === preview.canopyName),
    Match.tag('Invitation', ({ preview }) => current.id === preview.canopyId),
    Match.exhaustive
  )

const currentCanopy = (mine: ApiResult<CanopyResponse>) =>
  pipe(
    Result.getSuccess(mine),
    Option.flatMap(({ canopy }) => Option.fromNullishOr(canopy))
  )

const fromMembership = (
  offer: JoinOffer,
  mine: ApiResult<CanopyResponse>,
  busy: boolean
): JoinScreen => {
  const { preview } = offer
  return Option.match(currentCanopy(mine), {
    onNone: (): JoinScreen =>
      preview.memberCount >= CANOPY_MAX_MEMBERS
        ? { _tag: 'Full', preview, limit: CANOPY_MAX_MEMBERS }
        : { _tag: 'Ready', preview, busy, failed: false },
    onSome: (current): JoinScreen =>
      isOffered(offer, current)
        ? { _tag: 'AlreadyHere', preview, busy }
        : switchOrFull(preview, current.name, busy),
  })
}

const isMemberOf = (canopyId: CanopyId, mine: ApiResult<CanopyResponse>) =>
  Option.exists(currentCanopy(mine), (current) => current.id === canopyId)

/** An accepted invitation still opens the Canopy for someone who stayed in it. */
const fromStatus = (
  offer: JoinOffer,
  mine: ApiResult<CanopyResponse>,
  busy: boolean
): JoinScreen =>
  pipe(
    Match.value(offer),
    Match.tag('Link', () => fromMembership(offer, mine, busy)),
    Match.tag('Invitation', ({ preview }) =>
      pipe(
        Match.value(preview.status),
        Match.when('pending', () => fromMembership(offer, mine, busy)),
        Match.when(
          'accepted',
          (): JoinScreen =>
            isMemberOf(preview.canopyId, mine)
              ? { _tag: 'AlreadyHere', preview, busy }
              : { _tag: 'Closed' }
        ),
        Match.when('expired', (): JoinScreen => ({ _tag: 'Expired' })),
        Match.whenOr(
          'declined',
          'withdrawn',
          (): JoinScreen => ({ _tag: 'Closed' })
        ),
        Match.exhaustive
      )
    ),
    Match.exhaustive
  )

/**
 * Checked against a freshly fetched preview just before leaving, so an invite
 * that was revoked, expired or filled up since the screen loaded never costs
 * the user their current Canopy.
 */
export const mayLeaveToJoin = (inputs: Omit<JoinInputs, 'attempt'>): boolean =>
  joinScreen({ ...inputs, attempt: { _tag: 'Idle' } })._tag ===
  'InAnotherCanopy'

export const joinScreen = ({
  source,
  offer,
  mine,
  attempt,
}: JoinInputs): JoinScreen => {
  if (Option.isNone(source)) return { _tag: 'Invalid' }
  if (attempt._tag === 'Joined') {
    return { _tag: 'PickPlants', canopyName: attempt.canopyName }
  }
  if (offer === undefined || mine === undefined) return { _tag: 'Loading' }

  return Result.match(offer, {
    onFailure: (error) => fromPreviewError(error, source.value),
    onSuccess: (loaded) =>
      attempt._tag === 'Refused'
        ? fromAcceptError(attempt.error, loaded.preview, source.value)
        : fromStatus(loaded, mine, attempt._tag === 'Working'),
  })
}
