import type {
  Canopy,
  CanopyInvitationView,
  CanopyInvitePreview,
} from '@lily/shared'
import { Match, Option, pipe, Result } from 'effect'
import { useCanopyInvitation, useCanopyInvite } from '@/hooks/useCanopyInvite'
import {
  useAcceptCanopyInvitation,
  useAcceptCanopyInvite,
} from '@/hooks/useCanopyMutations'
import type { JoinOffer, JoinSource } from '@/screens/canopy-join/join-state'
import type { ApiResult } from '@/utils/client'

const tokenOf = (source: Option.Option<JoinSource>) =>
  Option.flatMap(source, (s) =>
    s._tag === 'Link' ? Option.some(s.token) : Option.none()
  )

const invitationIdOf = (source: Option.Option<JoinSource>) =>
  Option.flatMap(source, (s) =>
    s._tag === 'Invitation' ? Option.some(s.id) : Option.none()
  )

const linkOffer = (result: ApiResult<CanopyInvitePreview> | undefined) =>
  pipe(
    Option.fromNullishOr(result),
    Option.map(Result.map((preview): JoinOffer => ({ _tag: 'Link', preview }))),
    Option.getOrUndefined
  )

const invitationOffer = (result: ApiResult<CanopyInvitationView> | undefined) =>
  pipe(
    Option.fromNullishOr(result),
    Option.map(
      Result.map((preview): JoinOffer => ({ _tag: 'Invitation', preview }))
    ),
    Option.getOrUndefined
  )

export function useJoinTarget(source: Option.Option<JoinSource>) {
  const link = useCanopyInvite(tokenOf(source))
  const invitation = useCanopyInvitation(invitationIdOf(source))
  const acceptLink = useAcceptCanopyInvite()
  const acceptInvitation = useAcceptCanopyInvitation()

  const bySource = <A>(onLink: () => A, onInvitation: () => A) =>
    Option.map(source, (s) =>
      pipe(
        Match.value(s),
        Match.tag('Link', onLink),
        Match.tag('Invitation', onInvitation),
        Match.exhaustive
      )
    )

  const offer = pipe(
    bySource(
      () => linkOffer(link.result),
      () => invitationOffer(invitation.result)
    ),
    Option.getOrUndefined
  )

  const refetch = (): Promise<ApiResult<JoinOffer> | undefined> =>
    pipe(
      bySource(
        () => link.refetch().then(({ data }) => linkOffer(data)),
        () => invitation.refetch().then(({ data }) => invitationOffer(data))
      ),
      Option.getOrElse(() => Promise.resolve(undefined))
    )

  const accept = (s: JoinSource): Promise<Canopy> =>
    pipe(
      Match.value(s),
      Match.tag('Link', ({ token }) => acceptLink.mutateAsync(token)),
      Match.tag('Invitation', ({ id }) => acceptInvitation.mutateAsync(id)),
      Match.exhaustive
    )

  return { offer, refetch, accept }
}
