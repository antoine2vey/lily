import { WidgetUri, widgetMeta } from '@lily/mcp/widgets/constants'
import { PlantFilter } from '@lily/shared'
import { Schema } from 'effect'
import { Tool } from 'effect/ai'

export const ListPlants = Tool.make('list_plants', {
  description:
    'Lists your living plants with their health status, room, and care info. Use filter "dead" to list the cemetery (plants that died, with date and cause).',
  parameters: Schema.Struct({
    filter: Schema.optionalKey(PlantFilter).annotate({
      description:
        'Filter plants: all (default, living only), needsAttention, overdue, or dead (the cemetery)',
    }),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Meta, widgetMeta(WidgetUri.plantList))

export const GetPlantDetails = Tool.make('get_plant_details', {
  description:
    'Get detailed information about a specific plant including care schedules and recent history.',
  parameters: Schema.Struct({
    plantId: Schema.String.annotate({
      description: 'The plant ID to get details for',
    }),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Meta, widgetMeta(WidgetUri.plantDetails))

export const GetCareTasks = Tool.make('get_care_tasks', {
  description:
    'Get pending care tasks grouped by overdue, today, and upcoming (7-day window).',
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Meta, widgetMeta(WidgetUri.careTasks))

export const GetOverduePlants = Tool.make('get_overdue_plants', {
  description:
    'Lists plants that are overdue for care with details on what needs attention.',
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Meta, widgetMeta(WidgetUri.careTasks))

export const CarePlant = Tool.make('care_plant', {
  description:
    'Record a care action (watering, fertilization, misting, or repotting) for a plant.',
  parameters: Schema.Struct({
    plantId: Schema.String.annotate({
      description: 'The plant ID to care for',
    }),
    type: Schema.Literals([
      'watering',
      'fertilization',
      'misting',
      'repotting',
    ]).annotate({
      description: 'Type of care action',
    }),
    notes: Schema.optionalKey(Schema.String).annotate({
      description: 'Optional notes about the care',
    }),
  }),
}).annotate(Tool.Meta, widgetMeta(WidgetUri.careFeedback))

export const AskPlantQuestion = Tool.make('ask_plant_question', {
  description:
    'Search the plant care knowledge base. Returns relevant care advice from community and expert sources.',
  parameters: Schema.Struct({
    question: Schema.String.annotate({
      description: 'The plant care question to search for',
    }),
    plantName: Schema.optionalKey(Schema.String).annotate({
      description: 'Optional plant name to focus the search (e.g. "Monstera")',
    }),
  }),
}).annotate(Tool.Readonly, true)
