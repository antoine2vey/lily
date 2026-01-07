import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UsernameService } from '@lily/api/services/username/service'
import { DrizzleLive } from '@lily/db'
import { Effect, Layer } from 'effect'

// Implement the Username API group
export const UsernameApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'username', (handlers) =>
    Effect.gen(function* () {
      const usernameService = yield* UsernameService

      return handlers.handle('checkUsername', ({ urlParams: { username } }) =>
        usernameService.checkUsername(username)
      )
    })
  ).pipe(Layer.provide(UsernameService.Default), Layer.provide(DrizzleLive))
