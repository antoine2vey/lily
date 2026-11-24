import {
  type ChatMessageRow,
  ChatRepository,
} from '@lily/api/repositories/chat.repository'
import { chatContextFor } from '@lily/api/services/ai-chat/chat-context'
import { callerFor } from '@lily/api/services/plants/helpers/with-plant-access'
import { formatIsoDate } from '@lily/shared'
import { ChatMessageNotFoundError } from '@lily/shared/errors/admin'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * The prompt the chat would send for the next turn after `messageId`, built
 * by the chat itself, as the conversation's user sees the plant.
 */
export const previewPrompt = (messageId: string) =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository

    const messageRow = yield* chatRepo.findById(messageId)
    if (!messageRow) {
      return yield* new ChatMessageNotFoundError()
    }

    const conversation = yield* chatRepo.findConversationById(
      messageRow.conversationId
    )
    if (!conversation) {
      return yield* notAvailable(messageId)
    }

    const hasImage = messageRow.imageKey !== null
    const context = yield* chatContextFor(
      yield* callerFor(conversation.userId),
      conversation,
      { withImage: hasImage }
    ).pipe(
      Effect.catchTags({
        PlantNotFoundError: () => notAvailable(messageId),
        PlantNotAuthorizedError: () => notAvailable(messageId),
      })
    )

    const plantContext = yield* pipe(
      Match.value(context),
      Match.discriminatorsExhaustive('kind')({
        plant: (plantContext) => Effect.succeed(plantContext),
        general: () => notAvailable(messageId),
      })
    )
    const { plant, daysSinceAdded } = plantContext

    const previousRows = yield* chatRepo.findMessagesBefore({
      conversationId: messageRow.conversationId,
      beforeDate: messageRow.createdAt,
    })

    return {
      message: {
        id: messageRow.id,
        role: messageRow.role as 'user' | 'assistant',
        content: messageRow.content,
        createdAt: messageRow.createdAt,
      },
      plant: {
        id: plant.id,
        name: plant.name,
        category: plant.category,
        description: plant.description,
        health: plant.health,
        humidityRating: plant.humidityRating,
        lightingRating: plant.lightingRating,
        wateringRating: plant.wateringRating,
        petToxicityRating: plant.petToxicityRating,
        dateAdded: plant.dateAdded.toISOString(),
        daysSinceAdded,
      },
      careHistory: Array.map(plantContext.careHistory, (log) => ({
        type: log.type,
        date: formatIsoDate(log.date),
        notes: pipe(Option.fromNullishOr(log.notes), Option.getOrNull),
      })),
      conversationHistory: Array.map(previousRows, (row: ChatMessageRow) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
        createdAt: row.createdAt,
      })),
      systemPrompt: plantContext.systemPrompt,
      model: plantContext.model,
      hasImage,
    }
  }).pipe(
    Effect.withSpan('AdminService.previewPrompt', {
      attributes: { 'message.id': messageId },
    })
  )

const notAvailable = (messageId: string) =>
  Effect.fail(
    new ChatMessageNotFoundError({
      message: `Plant conversation not found for message (id: ${messageId})`,
    })
  )
