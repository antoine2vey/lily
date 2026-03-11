import { Tool, Toolkit } from '@effect/ai'
import { Schema } from 'effect'

// ── Read-only Tools ────────────────────────────────────────────────────

/**
 * Tool definitions for the MCP server.
 *
 * Auth-requiring tools (list_plants, get_care_tasks, etc.) have CurrentUser
 * resolved per-request via bearer token validation in the handlers layer,
 * rather than via addDependency (which doesn't work for per-request deps
 * in the MCP HTTP transport).
 */

export const ListPlants = Tool.make('list_plants', {
  description:
    'Lists all your plants with their health status, room, and care info.',
  parameters: {
    filter: Schema.optionalWith(
      Schema.Literal('all', 'needsAttention', 'overdue'),
      { exact: true }
    ).annotations({
      description: 'Filter plants: all (default), needsAttention, or overdue',
    }),
  },
  success: Schema.String,
}).annotate(Tool.Readonly, true)

export const GetPlantDetails = Tool.make('get_plant_details', {
  description:
    'Get detailed information about a specific plant including care schedules and recent history.',
  parameters: {
    plantId: Schema.String.annotations({
      description: 'The plant ID to get details for',
    }),
  },
  success: Schema.String,
}).annotate(Tool.Readonly, true)

export const GetCareTasks = Tool.make('get_care_tasks', {
  description:
    'Get pending care tasks grouped by overdue, today, and upcoming (7-day window).',
  success: Schema.String,
}).annotate(Tool.Readonly, true)

export const GetOverduePlants = Tool.make('get_overdue_plants', {
  description:
    'Lists plants that are overdue for care with details on what needs attention.',
  success: Schema.String,
}).annotate(Tool.Readonly, true)

export const AskPlantQuestion = Tool.make('ask_plant_question', {
  description:
    'Search the plant care knowledge base. Returns relevant care advice from community and expert sources.',
  parameters: {
    question: Schema.String.annotations({
      description: 'The plant care question to search for',
    }),
    plantName: Schema.optionalWith(Schema.String, {
      exact: true,
    }).annotations({
      description: 'Optional plant name to focus the search (e.g. "Monstera")',
    }),
  },
  success: Schema.String,
}).annotate(Tool.Readonly, true)

// ── Write Tools ────────────────────────────────────────────────────────

export const WaterPlant = Tool.make('water_plant', {
  description: 'Record that you watered a plant. Creates a care log entry.',
  parameters: {
    plantId: Schema.String.annotations({
      description: 'The plant ID to water',
    }),
    notes: Schema.optionalWith(Schema.String, {
      exact: true,
    }).annotations({
      description: 'Optional notes about the watering',
    }),
  },
  success: Schema.String,
})

export const CarePlant = Tool.make('care_plant', {
  description: 'Record a care action (watering or fertilization) for a plant.',
  parameters: {
    plantId: Schema.String.annotations({
      description: 'The plant ID to care for',
    }),
    type: Schema.Literal('watering', 'fertilization').annotations({
      description: 'Type of care action',
    }),
    notes: Schema.optionalWith(Schema.String, {
      exact: true,
    }).annotations({
      description: 'Optional notes about the care',
    }),
  },
  success: Schema.String,
})

// ── Toolkit ────────────────────────────────────────────────────────────

export const PlantToolkit = Toolkit.make(
  ListPlants,
  GetPlantDetails,
  GetCareTasks,
  GetOverduePlants,
  AskPlantQuestion,
  WaterPlant,
  CarePlant
)
