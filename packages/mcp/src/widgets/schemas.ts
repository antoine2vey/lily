/**
 * Structured data schemas for widget tool responses.
 *
 * These define the JSON shape that each widget template reads from
 * `window.openai.toolOutput` to render rich UI in ChatGPT iframes.
 * Non-widget clients ignore structuredContent and use markdown fallback.
 */

// ── Plant Summary (list_plants, get_overdue_plants) ─────────────────

export interface PlantSummary {
  readonly id: string
  readonly name: string
  readonly healthLabel: string
  readonly healthColor: string
  readonly roomName: string | null
  readonly roomIcon: string | null
  readonly ownership: string
  readonly ownerName: string | null
}

// ── Plant Detail (get_plant_details) ────────────────────────────────

export interface PlantScheduleItem {
  readonly careType: string
  readonly frequencyDays: number
  readonly nextCareAt: string | null
}

export interface CareLogItem {
  readonly date: string
  readonly type: string
  readonly notes: string | null
}

export interface PlantDetail {
  readonly id: string
  readonly name: string
  readonly healthLabel: string
  readonly healthColor: string
  readonly category: string | null
  readonly roomName: string | null
  readonly roomIcon: string | null
  readonly dateAdded: string
  readonly wateringRating: number
  readonly lightingRating: number
  readonly humidityRating: number
  readonly petToxicityRating: number
  readonly schedules: readonly PlantScheduleItem[]
  readonly recentCare: readonly CareLogItem[]
  readonly needsWatering: boolean
  readonly needsFertilizing: boolean
}

// ── Care Tasks (get_care_tasks, get_overdue_plants) ─────────────────

export interface CareTaskItem {
  readonly id: string
  readonly plantId: string
  readonly plantName: string
  readonly careType: string
  readonly dueDate: string
  readonly roomName: string | null
  readonly roomIcon: string | null
  readonly actionable: boolean
}

export interface CareTaskGroups {
  readonly overdue: readonly CareTaskItem[]
  readonly today: readonly CareTaskItem[]
  readonly upcoming: readonly CareTaskItem[]
}

// ── Care Feedback (water_plant, care_plant) ─────────────────────────

export interface CareFeedback {
  readonly plantName: string
  readonly careType: string
  readonly careLabel: string
  readonly nextCareEstimate: string
}
