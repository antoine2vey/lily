import { Rpc, RpcGroup } from '@effect/rpc'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import {
  Plant,
  PlantByIdRequest,
  PlantByUserIdRequest,
  PlantCreateRequest,
  PlantDeleteRequest,
  PlantUpdateRequest,
  PlantWaterRequest,
} from '@lily/shared/plant'
import { Schema } from 'effect'

// Define a group of RPCs for plant management
export class PlantRpc extends RpcGroup.make(
  // Get all plants
  Rpc.make('PlantList', {
    success: Plant,
    stream: true,
    error: DatabaseError,
  }),

  // Get plant by ID
  Rpc.make('PlantById', {
    success: Plant,
    stream: true,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantByIdRequest,
  }),

  // Get plants by user ID
  Rpc.make('PlantByUserId', {
    success: Plant,
    stream: true,
    error: DatabaseError,
    payload: PlantByUserIdRequest,
  }),

  // Create a new plant
  Rpc.make('PlantCreate', {
    success: Plant,
    error: DatabaseError,
    payload: PlantCreateRequest,
  }),

  // Update a plant
  Rpc.make('PlantUpdate', {
    success: Plant,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantUpdateRequest,
  }),

  // Delete a plant
  Rpc.make('PlantDelete', {
    success: Plant,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantDeleteRequest,
  }),

  // Water a plant
  Rpc.make('PlantWater', {
    success: Plant,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantWaterRequest,
  })
) {}
