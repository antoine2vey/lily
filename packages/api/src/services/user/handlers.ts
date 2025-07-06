import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UserService } from '@lily/api/services/user/service'
import { Database } from '@lily/db'
import { Effect, Layer } from 'effect'

// Implement the Users API group
export const UsersApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'users', (handlers) =>
    Effect.gen(function* () {
      const userService = yield* UserService

      return handlers
        .handle('getUsers', () => userService.findUsers)
        .handle('getUser', ({ path: { id } }) => userService.findUserById(id))
        .handle('createUser', ({ payload }) =>
          userService.createUser(payload.name, payload.email, payload.appleId)
        )
        .handle('updateUser', ({ path: { id }, payload }) =>
          userService.updateUser(id, payload)
        )
        .handle('deleteUser', ({ path: { id } }) => userService.deleteUser(id))
    })
  ).pipe(Layer.provide(UserService.Default), Layer.provide(Database.Default))
