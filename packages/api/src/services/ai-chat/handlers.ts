import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { AIChatService } from '@lily/api/services/ai-chat/service'
import { Auth } from '@lily/api/services/auth/auth'
import { withSession } from '@lily/api/services/auth/session'
import { Effect, Layer } from 'effect'

// Implement the AI Chat API group
export const AIChatApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'aiChat', (handlers) =>
    Effect.gen(function* () {
      const aiChatService = yield* AIChatService

      return handlers
        .handle('sendChatMessage', ({ path: { plantId }, payload }) =>
          withSession(aiChatService.sendChatMessage(plantId, payload))
        )
        .handle('getChatHistory', ({ path: { plantId } }) =>
          aiChatService.getChatHistory(plantId)
        )
    })
  ).pipe(Layer.provide(AIChatService.Default), Layer.provide(Auth.Default))
