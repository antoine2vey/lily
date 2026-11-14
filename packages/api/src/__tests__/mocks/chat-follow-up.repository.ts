import {
  ChatFollowUpRepository,
  type IChatFollowUpRepository,
} from '@lily/api/repositories/chat-follow-up.repository'
import {
  type FollowUpSet,
  lifecycleOf,
} from '@lily/api/services/ai-chat/follow-up-set'
import { Array, DateTime, Effect, Layer, Option, Order, pipe } from 'effect'

export const createMockChatFollowUpRepository = (
  sets: FollowUpSet[] = []
): Layer.Layer<ChatFollowUpRepository> => {
  const indexOf = (userId: string, plantId: string) =>
    sets.findIndex((set) => set.userId === userId && set.plantId === plantId)

  const replace = (
    userId: string,
    plantId: string,
    change: (set: FollowUpSet) => FollowUpSet
  ) => {
    const index = indexOf(userId, plantId)
    const set = sets[index]
    if (set !== undefined) sets[index] = change(set)
  }

  const repo: IChatFollowUpRepository = {
    findByUser: (userId) =>
      Effect.succeed(Array.filter(sets, (set) => set.userId === userId)),

    find: (userId, plantId) =>
      Effect.succeed(Option.fromNullishOr(sets[indexOf(userId, plantId)])),

    request: ({ userId, plantIds, language, at }) =>
      Effect.sync(() => {
        Array.forEach(plantIds, (plantId) => {
          const existing = sets[indexOf(userId, plantId)]
          if (existing === undefined) {
            sets.push({
              userId,
              plantId,
              language,
              requestedAt: at,
              claimedUntil: null,
              generatedAt: null,
              followUps: [],
            })
            return
          }
          if (existing.requestedAt !== null) return
          replace(userId, plantId, (set) => ({
            ...set,
            language,
            requestedAt: at,
            followUps: set.language === language ? set.followUps : [],
          }))
        })
      }),

    claim: ({ limit, at, until }) =>
      Effect.sync(() => {
        const claimed = pipe(
          sets,
          Array.filter(
            (set) =>
              lifecycleOf(set, DateTime.fromDateUnsafe(at)) === 'requested'
          ),
          Array.sort(
            Order.mapInput(
              Order.Number,
              (set: FollowUpSet) => set.requestedAt?.getTime() ?? 0
            )
          ),
          Array.take(limit)
        )
        Array.forEach(claimed, ({ userId, plantId }) => {
          replace(userId, plantId, (set) => ({ ...set, claimedUntil: until }))
        })
        return Array.map(claimed, (set) => ({ ...set, claimedUntil: until }))
      }),

    store: ({ userId, plantId, followUps, at }) =>
      Effect.sync(() =>
        replace(userId, plantId, (set) => ({
          ...set,
          followUps,
          generatedAt: at,
          requestedAt: null,
          claimedUntil: null,
        }))
      ),

    release: ({ userId, plantId }) =>
      Effect.sync(() =>
        replace(userId, plantId, (set) => ({
          ...set,
          requestedAt: null,
          claimedUntil: null,
        }))
      ),
  }

  return Layer.succeed(ChatFollowUpRepository, repo)
}
