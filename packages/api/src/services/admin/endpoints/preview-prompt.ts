import {
  type ChatMessageRow,
  ChatRepository,
} from '@lily/api/repositories/chat.repository'
import { plantChatContext } from '@lily/api/services/ai-chat/chat-context'
import {
  callerFor,
  plantViewFor,
} from '@lily/api/services/plants/helpers/with-plant-access'
import { formatIsoDate } from '@lily/shared'
import { ChatMessageNotFoundError } from '@lily/shared/errors/admin'
import { Array, Effect, Option, pipe } from 'effect'

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
    if (conversation?.kind !== 'plant') {
      return yield* notAvailable(messageId)
    }

    const hasImage = messageRow.imageKey !== null
    const { plant, view } = yield* plantViewFor(
      yield* callerFor(conversation.userId),
      conversation.plantId,
      'chat'
    ).pipe(
      Effect.catchTags({
        PlantNotFoundError: () => notAvailable(messageId),
        PlantNotAuthorizedError: () => notAvailable(messageId),
      })
    )
    const context = yield* plantChatContext(
      { plant, view },
      { withImage: hasImage }
    )

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
        daysSinceAdded: context.daysSinceAdded,
      },
      careHistory: Array.map(context.careHistory, (log) => ({
        type: log.type,
        date: formatIsoDate(log.date),
        notes: pipe(Option.fromNullishOr(log.notes), Option.getOrNull),
      })),
      conversationHistory: Array.map(previousRows, (row: ChatMessageRow) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
        createdAt: row.createdAt,
      })),
      systemPrompt: context.systemPrompt,
      model: context.model,
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
