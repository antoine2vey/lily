import { CarePlant, GetPlantDetails } from '@lily/mcp/tools/definitions'
import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

const traversalIds = ['../canopies/me/leave#', 'plant-1', '1/../../x', '']
const plantId = '3f2b8c1e-5d4a-4b7e-9c0d-1a2b3c4d5e6f'

describe('plantId tool parameter', () => {
  it.each(traversalIds)('care_plant rejects %j', async (id) => {
    const result = await Effect.runPromise(
      Schema.decodeUnknownEffect(CarePlant.parametersSchema)({
        plantId: id,
        type: 'watering',
      }).pipe(Effect.flip)
    )
    expect(result).toBeDefined()
  })

  it.each(traversalIds)('get_plant_details rejects %j', async (id) => {
    const result = await Effect.runPromise(
      Schema.decodeUnknownEffect(GetPlantDetails.parametersSchema)({
        plantId: id,
      }).pipe(Effect.flip)
    )
    expect(result).toBeDefined()
  })

  it('accepts a UUID', async () => {
    const params = await Effect.runPromise(
      Schema.decodeUnknownEffect(GetPlantDetails.parametersSchema)({ plantId })
    )
    expect(params.plantId).toBe(plantId)
  })
})
