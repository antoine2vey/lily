import { Database } from '@lily/db'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { Effect } from 'effect'

export const auth = Effect.gen(function* () {
  const db = yield* Database

  return betterAuth({
    database: prismaAdapter(db.client, {
      provider: 'postgresql',
    }),
    plugins: [],
  })
}).pipe(Effect.provide(Database.Default), Effect.runSync)

export class Auth extends Effect.Service<Auth>()('Auth', {
  effect: Effect.succeed(auth),
}) {}
