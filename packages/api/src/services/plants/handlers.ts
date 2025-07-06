import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { PlantsService } from '@lily/api/services/plants/service'
import { Database } from '@lily/db'
import { Effect, Layer } from 'effect'

// Implement the Plants API group
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    Effect.gen(function* () {
      const plantsService = yield* PlantsService

      return handlers
        .handle('getPlants', () => plantsService.findPlants)
        .handle('getPlant', ({ path: { id } }) =>
          plantsService.findPlantById({ id })
        )
        .handle('getPlantsByUser', ({ path: { userId } }) =>
          plantsService.findPlantsByUserId({ userId })
        )
        .handle('createPlant', ({ payload }) =>
          plantsService.createPlant(payload)
        )
        .handle('deletePlant', ({ path: { id } }) =>
          plantsService.deletePlant({ id })
        )
        .handle('updatePlant', ({ path: { id }, payload }) =>
          plantsService.updatePlant({ ...payload, id })
        )
        .handle('waterPlant', ({ path: { id }, payload }) =>
          plantsService.waterPlant({ ...payload, id })
        )
    })
  ).pipe(Layer.provide(PlantsService.Default), Layer.provide(Database.Default))
