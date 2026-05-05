import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import {
  type ChatMessageRow,
  ChatRepository,
} from '@lily/api/repositories/chat.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import {
  buildSystemPrompt,
  formatCareHistoryText,
} from '@lily/api/services/ai-chat/build-system-prompt'
import { RagService } from '@lily/api/services/rag/service'
import { daysSince, formatIsoDate } from '@lily/shared'
import type { PromptPreviewResponse } from '@lily/shared/admin'
import { ChatMessageNotFoundError } from '@lily/shared/errors/admin'
import { Array, Effect, Option, pipe } from 'effect'

export const previewPrompt = (
  messageId: string
): Effect.Effect<
  PromptPreviewResponse,
  SqlError | ChatMessageNotFoundError,
  | ChatRepository
  | PlantRepository
  | CareLogRepository
  | CareScheduleRepository
  | RagService
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const plantRepo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const scheduleRepo = yield* CareScheduleRepository
    const ragService = yield* RagService

    // 1. Find the message by DB id
    const messageRow = yield* chatRepo.findById(messageId)
    if (!messageRow) {
      return yield* new ChatMessageNotFoundError()
    }

    // 2. Resolve the conversation, then the plant it is anchored to
    const conversation = yield* chatRepo.findConversationById(
      messageRow.conversationId
    )
    if (!conversation || !conversation.plantId) {
      return yield* new ChatMessageNotFoundError({
        message: `Plant conversation not found for message (id: ${messageId})`,
      })
    }
    const plantIdForMessage = conversation.plantId

    const plant = yield* plantRepo.findById(plantIdForMessage)
    if (!plant) {
      return yield* new ChatMessageNotFoundError({
        message: `Plant not found for message (plantId: ${plantIdForMessage})`,
      })
    }

    // 3. Load care schedules for the plant
    const schedules = yield* scheduleRepo.findByPlant(plant.id)

    // 4. Load care history (same as plantChat: last 10)
    const careLogsResponse = yield* careLogRepo.findByPlantId({
      plantId: plantIdForMessage,
      limit: 10,
    })

    const careHistoryText = formatCareHistoryText(careLogsResponse.items)

    // 5. Run RAG retrieval for admin preview (without translation — RAG is now tool-driven)
    const ragQuery = `${plant.name}: ${messageRow.content}`
    const ragChunks = yield* ragService.retrieve({
      query: ragQuery,
    })
    const formattedRagContext = ragService.formatContext(ragChunks)

    // 6. Build system prompt
    const daysSinceAdded = daysSince(plant.dateAdded)
    const systemPrompt = buildSystemPrompt({
      plant: { ...plant, schedules },
      daysSinceAdded,
      careHistoryText,
    })

    // 8. Load conversation history (messages before this one)
    const previousRows = yield* chatRepo.findMessagesBefore({
      conversationId: messageRow.conversationId,
      beforeDate: messageRow.createdAt,
    })

    const conversationHistory = Array.map(
      previousRows,
      (row: ChatMessageRow) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
        createdAt: row.createdAt,
      })
    )

    // 9. Determine model and image status
    const hasImage = Boolean(messageRow.imageKey)
    const model = hasImage ? 'gpt-4o' : 'gpt-4o-mini'

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
      careHistory: Array.map(careLogsResponse.items, (log) => ({
        type: log.type,
        date: formatIsoDate(log.date),
        notes: pipe(Option.fromNullable(log.notes), Option.getOrNull),
      })),
      ragQuery,
      ragChunks: Array.map(ragChunks, (chunk) => ({
        id: chunk.id,
        content: chunk.content,
        source: chunk.source,
        sourceUrl: chunk.sourceUrl,
        plantType: chunk.plantType,
        category: chunk.category,
        metadata: chunk.metadata,
        similarity: chunk.similarity,
      })),
      formattedRagContext,
      conversationHistory,
      systemPrompt,
      model,
      hasImage,
    }
  }).pipe(
    Effect.withSpan('AdminService.previewPrompt', {
      attributes: { 'message.id': messageId },
    })
  )
