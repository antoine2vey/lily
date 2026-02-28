import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import {
  type ChatMessageRow,
  ChatRepository,
} from '@lily/api/repositories/chat.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { buildSystemPrompt } from '@lily/api/services/ai-chat/build-system-prompt'
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
  ChatRepository | PlantRepository | CareLogRepository | RagService
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const plantRepo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const ragService = yield* RagService

    // 1. Find the message by DB id
    const messageRow = yield* chatRepo.findById(messageId)
    if (!messageRow) {
      return yield* Effect.fail(new ChatMessageNotFoundError())
    }

    // 2. Load plant data
    const plant = yield* plantRepo.findById(messageRow.plantId)
    if (!plant) {
      return yield* Effect.fail(
        new ChatMessageNotFoundError({
          message: `Plant not found for message (plantId: ${messageRow.plantId})`,
        })
      )
    }

    // 3. Load care history (same as plantChat: last 10)
    const careLogsResponse = yield* careLogRepo.findByPlantId({
      plantId: messageRow.plantId,
      limit: 10,
    })

    const careHistoryText = pipe(
      careLogsResponse.items,
      Array.map(
        (log) =>
          `- ${log.type} on ${formatIsoDate(log.date)}${log.notes ? `: "${log.notes}"` : ''}`
      ),
      Array.join('\n')
    )

    // 4. Determine the user message text for RAG query
    const userMessageText = messageRow.content

    // 5. Run RAG retrieval
    const ragQuery = `${plant.name}: ${userMessageText}`
    const ragChunks = yield* ragService.retrieve({
      query: ragQuery,
      plantType: Option.getOrUndefined(Option.fromNullable(plant.category)),
    })
    const formattedRagContext = ragService.formatContext(ragChunks)

    // 6. Build system prompt
    const daysSinceAdded = daysSince(plant.dateAdded)
    const systemPrompt = buildSystemPrompt({
      plant,
      daysSinceAdded,
      careHistoryText,
      knowledgeContext: formattedRagContext,
    })

    // 7. Load conversation history (messages before this one)
    const previousRows = yield* chatRepo.findMessagesBefore({
      plantId: messageRow.plantId,
      userId: messageRow.userId,
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

    // 8. Determine model and image status
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
        wateringFrequencyDays: plant.wateringFrequencyDays,
        lastWateredAt: pipe(
          Option.fromNullable(plant.lastWateredAt),
          Option.map((d) => d.toISOString()),
          Option.getOrNull
        ),
        nextWateringAt: pipe(
          Option.fromNullable(plant.nextWateringAt),
          Option.map((d) => d.toISOString()),
          Option.getOrNull
        ),
        fertilizationFrequencyDays: plant.fertilizationFrequencyDays,
        lastFertilizedAt: pipe(
          Option.fromNullable(plant.lastFertilizedAt),
          Option.map((d) => d.toISOString()),
          Option.getOrNull
        ),
        nextFertilizationAt: pipe(
          Option.fromNullable(plant.nextFertilizationAt),
          Option.map((d) => d.toISOString()),
          Option.getOrNull
        ),
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
