import {
  mockPlants,
  type PlantRecord,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { listChatStarters } from '@lily/api/services/ai-chat/endpoints/list-chat-starters'
import type { ChatConversation, ChatMessage } from '@lily/shared/ai-chat'
import { Array, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const { scheduleSpecs: _, ...basePlant } = mockPlants[0]!

const plant = (
  id: string,
  overrides: Partial<PlantRecord> = {}
): PlantRecord => ({
  ...basePlant,
  id,
  name: `Plant ${id}`,
  userId: 'user-1',
  createdByUserId: 'user-1',
  dateAdded: new Date('2024-01-01'),
  ...overrides,
})

const plantConversation = (
  plantId: string,
  userId = 'user-1'
): ChatConversation => ({
  id: `conv-${plantId}-${userId}`,
  userId,
  kind: 'plant',
  plantId,
  createdAt: new Date('2024-02-01'),
  lastMessageAt: new Date('2024-02-01'),
})

const messageIn = (conversation: ChatConversation): ChatMessage => ({
  id: `msg-${conversation.id}`,
  role: 'user',
  content: 'Hello',
  conversationId: conversation.id,
  userId: conversation.userId,
  createdAt: new Date('2024-02-01'),
})

const run = (data: {
  plants: PlantRecord[]
  caretakingPlants?: PlantRecord[]
  conversations?: ChatConversation[]
  messages?: ChatMessage[]
}) =>
  Effect.runPromise(
    listChatStarters.pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockPlantRepository({
            plants: data.plants,
            caretakingPlants: Array.map(data.caretakingPlants ?? [], (p) => ({
              plant: p,
              ownerName: 'Sam',
            })),
          }),
          createMockChatRepository({
            conversations: data.conversations ?? [],
            messages: data.messages ?? [],
          }),
          createMockCurrentUser({ id: 'user-1' })
        )
      )
    )
  )

const ids = (result: { plants: ReadonlyArray<{ plantId: string }> }) =>
  Array.map(result.plants, (p) => p.plantId)

describe('listChatStarters', () => {
  it('leaves out a plant whose conversation holds a message', async () => {
    const chatted = plantConversation('chatted')
    const result = await run({
      plants: [plant('chatted'), plant('fresh')],
      conversations: [chatted],
      messages: [messageIn(chatted)],
    })

    expect(ids(result)).toEqual(['fresh'])
  })

  it('keeps a plant whose conversation row has no message', async () => {
    const result = await run({
      plants: [plant('opened')],
      conversations: [plantConversation('opened')],
    })

    expect(ids(result)).toEqual(['opened'])
  })

  it('keeps a plant only another user has chatted about', async () => {
    const theirs = plantConversation('shared', 'user-2')
    const result = await run({
      plants: [plant('shared')],
      conversations: [theirs],
      messages: [messageIn(theirs)],
    })

    expect(ids(result)).toEqual(['shared'])
  })

  it('leaves out a dead plant', async () => {
    const result = await run({
      plants: [
        plant('alive'),
        plant('buried', { diedAt: new Date('2024-03-01') }),
      ],
    })

    expect(ids(result)).toEqual(['alive'])
  })

  it('includes the plants the user takes care of for someone else', async () => {
    const result = await run({
      plants: [],
      caretakingPlants: [plant('minded', { userId: 'user-2' })],
    })

    expect(ids(result)).toEqual(['minded'])
  })

  it('lists plants that need help first, then the most recently added', async () => {
    const result = await run({
      plants: [
        plant('old-healthy', { dateAdded: new Date('2024-01-01') }),
        plant('new-thriving', {
          health: 'THRIVING',
          dateAdded: new Date('2024-05-01'),
        }),
        plant('old-sick', {
          health: 'SICK',
          dateAdded: new Date('2024-01-02'),
        }),
        plant('new-recovering', {
          health: 'RECOVERING',
          dateAdded: new Date('2024-04-01'),
        }),
      ],
    })

    expect(ids(result)).toEqual([
      'new-recovering',
      'old-sick',
      'new-thriving',
      'old-healthy',
    ])
  })

  it('caps the list at 20 plants', async () => {
    const result = await run({
      plants: Array.makeBy(25, (i) =>
        plant(`p-${i}`, { dateAdded: new Date(2024, 0, i + 1) })
      ),
    })

    expect(result.plants).toHaveLength(20)
    expect(Array.head(ids(result))).toEqual(Option.some('p-24'))
  })

  it('carries the photo only when the plant has one', async () => {
    const result = await run({
      plants: [
        plant('bare', { name: 'Bare', dateAdded: new Date('2024-01-01') }),
        plant('pictured', {
          name: 'Pictured',
          imageUrl: 'https://example.com/p.jpg',
          dateAdded: new Date('2024-01-02'),
        }),
      ],
    })

    expect(result.plants).toEqual([
      {
        plantId: 'pictured',
        name: 'Pictured',
        imageUrl: 'https://example.com/p.jpg',
      },
      { plantId: 'bare', name: 'Bare' },
    ])
  })
})
