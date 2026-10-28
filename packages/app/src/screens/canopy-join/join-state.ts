import type { CanopyInvitePreview, CanopyResponse } from '@lily/shared'
import { Match, Option, pipe, Result } from 'effect'
import type { InviteToken } from '@/utils/canopy-invite-token'
import type { ApiFailure, ApiResult } from '@/utils/client'

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
  readonly token: Option.Option<InviteToken>
  /** `undefined` while the preview loads. */
  readonly preview: ApiResult<CanopyInvitePreview> | undefined
  /** `undefined` while the caller's own Canopy loads. */
  readonly mine: ApiResult<CanopyResponse> | undefined
  readonly attempt: JoinAttempt
}

const fromPreviewError = (error: ApiFailure): JoinScreen =>
  pipe(
    Match.value(error._tag),
    Match.when(
      'CanopyInviteNotFoundError',
      (): JoinScreen => ({
        _tag: 'Invalid',
      })
    ),
    Match.when(
      'CanopyInviteExpiredError',
      (): JoinScreen => ({
        _tag: 'Expired',
      })
    ),
    Match.orElse((): JoinScreen => ({ _tag: 'Unavailable' }))
  )

const fromAcceptError = (
  error: ApiFailure,
  preview: CanopyInvitePreview
): JoinScreen =>
  pipe(
    Match.value(error),
    Match.tag(
      'CanopyInviteNotFoundError',
      'CanopyNotFoundError',
      (): JoinScreen => ({ _tag: 'Invalid' })
    ),
    Match.tag(
      'CanopyInviteExpiredError',
      (): JoinScreen => ({ _tag: 'Expired' })
    ),
    Match.tag(
      'AlreadyInCanopyError',
      ({ canopyName }): JoinScreen => ({
        _tag: 'InAnotherCanopy',
        preview,
        currentName: canopyName,
        busy: false,
      })
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
 * The preview names the Canopy but not its id, so a member whose Canopy has
 * the invite's name is treated as already in it. Their only action re-sends
 * the accept, which the API answers with `AlreadyInCanopyError` when the
 * Canopy is a different one, so a name clash never joins or leaves anything.
 */
const fromMembership = (
  preview: CanopyInvitePreview,
  mine: ApiResult<CanopyResponse>,
  busy: boolean
): JoinScreen =>
  pipe(
    Result.getSuccess(mine),
    Option.flatMap(({ canopy }) => Option.fromNullishOr(canopy)),
    Option.match({
      onNone: (): JoinScreen => ({
        _tag: 'Ready',
        preview,
        busy,
        failed: false,
      }),
      onSome: (current): JoinScreen =>
        current.name === preview.canopyName
          ? { _tag: 'AlreadyHere', preview, busy }
          : {
              _tag: 'InAnotherCanopy',
              preview,
              currentName: current.name,
              busy,
            },
    })
  )

export const joinScreen = ({
  token,
  preview,
  mine,
  attempt,
}: JoinInputs): JoinScreen => {
  if (Option.isNone(token)) return { _tag: 'Invalid' }
  if (attempt._tag === 'Joined') {
    return { _tag: 'PickPlants', canopyName: attempt.canopyName }
  }
  if (preview === undefined || mine === undefined) return { _tag: 'Loading' }

  return Result.match(preview, {
    onFailure: fromPreviewError,
    onSuccess: (loaded) =>
      attempt._tag === 'Refused'
        ? fromAcceptError(attempt.error, loaded)
        : fromMembership(loaded, mine, attempt._tag === 'Working'),
  })
}
