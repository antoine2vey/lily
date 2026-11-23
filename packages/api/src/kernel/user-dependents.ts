import { Data } from 'effect'

/** What an exit does to a row that names the user in one column. */
export type Policy = Data.TaggedEnum<{
  /** The row is deleted. */
  Cascade: Record<never, never>
  /** The row stays and stops acting. `withdrawn` is the SQL condition that then holds. */
  Withdraw: { readonly withdrawn: string }
  /** The row stays and the column no longer names the user. */
  Reassign: Record<never, never>
  /** The row stays as it is. */
  Keep: { readonly reason: string }
}>

export const Policy = Data.taggedEnum<Policy>()

const { Cascade, Withdraw, Reassign, Keep } = Policy

type PurgePolicy = Extract<Policy, { readonly _tag: 'Cascade' | 'Reassign' }>

/** The policy of one column at each exit. */
export interface UserDependent {
  /** The deletion request, `releaseAccount`. */
  readonly release: Policy
  /** The hard deletion, `purgeAccount`. The foreign key's `ON DELETE` applies it. */
  readonly purge: PurgePolicy
  /** `Canopy.leave` and `Canopy.removeMember`, for a row in the canopy left. */
  readonly departure: Policy
}

const notActive = Keep({
  reason: 'the api refuses an account that is not active',
})
const history = Keep({ reason: 'history keeps who did it' })
const personal = Keep({ reason: 'it belongs to the account, not the canopy' })
const ownChat = Keep({ reason: 'the user keeps their own chat' })
const pendingInvitation = Withdraw({ withdrawn: "status = 'withdrawn'" })
const canceledDelegation = Withdraw({ withdrawn: "status = 'canceled'" })

/** Every foreign key column that references `users.id`, as `table.column`. */
export const USER_DEPENDENTS = {
  'activity_push_tokens.user_id': {
    release: Cascade(),
    purge: Cascade(),
    departure: personal,
  },
  'canopy_direct_invites.invited_by_user_id': {
    release: pendingInvitation,
    purge: Cascade(),
    departure: pendingInvitation,
  },
  'canopy_direct_invites.invitee_user_id': {
    release: pendingInvitation,
    purge: Cascade(),
    departure: pendingInvitation,
  },
  'canopy_invites.created_by_user_id': {
    release: Keep({ reason: 'a link belongs to the canopy' }),
    purge: Reassign(),
    departure: Keep({ reason: 'a link belongs to the canopy' }),
  },
  'canopy_members.user_id': {
    release: Cascade(),
    purge: Cascade(),
    departure: Cascade(),
  },
  'canopy_plant_mutes.user_id': {
    release: Cascade(),
    purge: Cascade(),
    departure: Cascade(),
  },
  'care_delegations.caretaker_id': {
    release: canceledDelegation,
    purge: Cascade(),
    departure: Keep({ reason: 'a delegation holds personal plants only' }),
  },
  'care_delegations.owner_id': {
    release: canceledDelegation,
    purge: Cascade(),
    departure: Keep({ reason: 'a delegation holds personal plants only' }),
  },
  'care_logs.performed_by_user_id': {
    release: history,
    purge: Reassign(),
    departure: history,
  },
  'care_plans.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: Keep({ reason: 'a plan stays with its plant' }),
  },
  'chat_conversations.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: ownChat,
  },
  'chat_follow_up_sets.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: ownChat,
  },
  'chat_messages.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: ownChat,
  },
  'dead_letter_messages.user_id': {
    release: Keep({ reason: 'an operator reviews it' }),
    purge: Reassign(),
    departure: personal,
  },
  'device_tokens.user_id': {
    release: Cascade(),
    purge: Cascade(),
    departure: personal,
  },
  'diagnoses.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: Keep({ reason: 'a diagnosis stays with its plant' }),
  },
  'gift_code_redemptions.user_id': {
    release: Keep({ reason: 'a restored account keeps its gift' }),
    purge: Cascade(),
    departure: personal,
  },
  'notifications.user_id': {
    release: Cascade(),
    purge: Cascade(),
    departure: Cascade(),
  },
  'oauth_access_tokens.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'oauth_identities.user_id': {
    release: Keep({ reason: 'a restored account signs in with it again' }),
    purge: Cascade(),
    departure: personal,
  },
  'oauth_refresh_tokens.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'oauth_user_api_credentials.user_id': {
    release: Keep({ reason: 'its api refresh token is revoked with the rest' }),
    purge: Cascade(),
    departure: personal,
  },
  'plant_photos.uploaded_by_user_id': {
    release: history,
    purge: Reassign(),
    departure: history,
  },
  'plant_scans.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'plants.created_by_user_id': {
    release: Keep({
      reason: 'a deleted account leaves its plants in the canopy',
    }),
    purge: Reassign(),
    departure: Keep({
      reason: 'the sharer is recorded once, and gets the plant back',
    }),
  },
  'plants.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'rare_plant_identifications.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'refresh_tokens.user_id': {
    release: Cascade(),
    purge: Cascade(),
    departure: personal,
  },
  'rooms.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'subscription_events.user_id': {
    release: Keep({ reason: 'a restored account keeps its subscription' }),
    purge: Cascade(),
    departure: personal,
  },
  'subscription_usage.user_id': {
    release: Keep({ reason: 'a restored account keeps its subscription' }),
    purge: Cascade(),
    departure: personal,
  },
  'user_achievements.user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'user_follows.follower_id': {
    release: Keep({ reason: 'a restored account keeps its follows' }),
    purge: Cascade(),
    departure: personal,
  },
  'user_follows.following_id': {
    release: Keep({ reason: 'a restored account keeps its follows' }),
    purge: Cascade(),
    departure: personal,
  },
  'user_nudges.from_user_id': {
    release: notActive,
    purge: Cascade(),
    departure: personal,
  },
  'user_nudges.to_user_id': {
    release: Keep({
      reason: 'delivery drops a push to an account that is not active',
    }),
    purge: Cascade(),
    departure: personal,
  },
  'user_subscriptions.user_id': {
    release: Keep({ reason: 'a restored account keeps its subscription' }),
    purge: Cascade(),
    departure: personal,
  },
} as const satisfies Record<`${string}.${string}`, UserDependent>

export type UserDependentColumn = keyof typeof USER_DEPENDENTS
