import {
  mockChatMessages,
  mockPlantConversation,
} from '@lily/api/__tests__/fixtures/chat'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { withConversationAuth } from '@lily/api/services/ai-chat/helpers/assert-can-access-conversation'
import { failureOf } from '@lily/shared/testing'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Backs the `getConversation` endpoint: the chat screen relies on `plantId`
// to scope plant-bound cards (diagnoses, care plans).
describe('withConversationAuth / getConversation', () => {
  const createTestLayer = (userId = mockPlantConversation.userId) =>
    Layer.mergeAll(
      createMockChatRepository({
        messages: [...mockChatMessages],
        conversations: [mockPlantConversation],
      }),
      createMockCurrentUser({ id: userId })
    )

  it('returns the conversation with its plant binding for the owner', async () => {
    const result = await Effect.runPromise(
      withConversationAuth(mockPlantConversation.id).pipe(
        Effect.provide(createTestLayer())
      )
    )
    expect(result).toEqual(mockPlantConversation)
  })

  it('hides the conversation from another user', async () => {
    const exit = await Effect.runPromiseExit(
      withConversationAuth(mockPlantConversation.id).pipe(
        Effect.provide(createTestLayer('someone-else'))
      )
    )
    expect(failureOf(exit)._tag).toBe('ConversationNotFoundError')
  })
})
