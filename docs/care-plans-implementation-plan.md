# AI Care Plans — Implementation Plan

Status: agreed and implemented 2026-09-11 (db, shared, api, app). Verified by `bun run tsc`, API vitest (1544 passing) and app jest for care, chat and i18n.

## Goal

When the chat assistant gives concrete, actionable advice for a plant ("repot into
fresh soil, hold off watering for 5 days, then check the leaves"), it proposes a
**care plan**: an ordered checklist attached to that plant. The chat renders the
proposal as a card with an **Add to tasks** button. Accepting it makes the plan
appear on the Care tab, where each step can be checked off.

## Decisions (from the grilling session)

| # | Decision |
|---|----------|
| Shape | A plan is a grouping (`care_plans`) of ordered steps (`care_plan_steps`). One task per step, grouped under the plan. |
| Recurrence | One-off only. No new recurrence model. |
| Care-typed steps | A step may carry an existing care type (watering / fertilization / misting / repotting). These bridge into the schedule model, see below. |
| Dates | Optional per step. Model expresses them as `dueInDays` offsets; server resolves against the user's timezone at proposal time. |
| Notifications | None for plan steps in v1. Schedule-derived tasks keep their existing reminder pipeline. |
| Detection | The model calls a `proposeCarePlan` tool (plant conversations only). The tool executes during the stream and inserts the plan as `proposed`. |
| Diagnoses | `createDiagnosis` treatment steps become structured (`title`, optional `careType`, optional `dueInDays`) and auto-create a proposed plan linked by `diagnosisId`. String column stays filled from titles. |
| Confirmation | "Add all" only. No editing before acceptance. Steps can be deleted after acceptance. |
| Scoping | Exactly one plant per plan. General conversations do not get the tool. |
| Dedup | Button is per assistant message; "Added" once accepted. No semantic dedup. |
| Caretakers | Owner only. |
| Placement | New **Plans** section on the Care tab between Today and Upcoming. Same card on the plant detail screen. |
| Coupling | Diagnoses no longer carry a manual resolved status (removed 2026-09-11, migration 0056). Plan completion is the only signal; the diagnosis row shows plan progress. |
| Guardrails | Max 8 steps per plan, one proposal per assistant turn, prompt says "only when concrete and actionable". |

### Schedule bridging (Q9 / Q10 / Q18 / Q19)

- **On accept**: for each step with a care type **and** a due date **and** an
  existing schedule of that type, set the schedule's `nextCareAt` to the due date
  (either direction) and reschedule the reminder through the existing
  `scheduleCareReminder`. No schedule of that type: no adjustment, no creation.
- **On step completion** (care-typed): run `executePlantCare` (care log, schedule
  advance, weather adjustment, next reminder). The care log id is stored on the
  step. If the plant was already cared for that day (`AlreadyCaredTodayError`),
  the step is marked done without a new log.
- **Cross-completion**: completing the normal schedule-derived task marks the
  **earliest** open step of that care type on that plant as done (with the log
  id). Both live inside `executePlantCare`, which takes an optional
  `carePlanStepId` so a step-initiated completion marks *that* step instead of
  the earliest one.
- **Show both**: the plan step and the schedule-derived task can coexist in the
  UI; completing either completes the other via the rule above.

### Lifecycle

- `proposed` → `accepted` (Add to tasks) or `dismissed`.
- `accepted` → `completed` automatically when the last step is done.
- Deleting an accepted plan removes it; schedule adjustments already applied stay.
- Uncompleting a step clears `completedAt` and `careLogId` on the step only; the
  care log is not touched (the care tab's undo is a client-side delay, not a
  server rewind, and this mirrors it).
- Chat context for a plant includes open steps and the last 5 completed ones.

## Data model

```
care_plan_status  enum: proposed | accepted | completed | dismissed
care_plan_source  enum: ai | user

care_plans
  id, plant_id (fk cascade), user_id (fk cascade),
  chat_message_id (fk set null), diagnosis_id (fk set null),
  title, source, status,
  accepted_at, completed_at, created_at, updated_at
  idx (user_id, status), idx (plant_id)

care_plan_steps
  id, plan_id (fk cascade), position,
  title, description, care_type (care_type enum, nullable),
  due_date, completed_at, care_log_id (fk set null),
  created_at, updated_at
  idx (plan_id)
```

Migration: `packages/db/drizzle/0055_add_care_plans.sql`, hand-authored.

## Package work

### db
- `schema/enums.ts`: two enums. `schema/care-plans.ts`: tables + relations.

### shared
- `domains/care-plan/schema.ts`: `CarePlanStatus`, `CarePlanSource`,
  `CarePlanStep`, `CarePlan` (includes `plantName`, `plantImageUrl`, `steps`),
  `CarePlanListResponse`, `CARE_PLAN_MAX_STEPS`.
- `domains/care-plan/errors.ts`: `CarePlanNotFoundError`,
  `CarePlanStepNotFoundError`, `CarePlanNotProposedError`.
- Exports in `package.json` (`./care-plan`, `./errors/care-plan`) and `index.ts`.

### api
- `repositories/care-plan.repository.ts`.
- `services/care-plans/{api,handlers}.ts` + `endpoints/`:
  - `GET  /care-plans?status=accepted` — current user's plans with steps.
  - `GET  /care-plans/plant/:plantId` — all plans for a plant (any status).
  - `PATCH /care-plans/:planId/accept` — status flip + schedule bridging.
  - `PATCH /care-plans/:planId/dismiss`
  - `DELETE /care-plans/:planId`
  - `PATCH /care-plans/:planId/steps/:stepId/complete`
  - `PATCH /care-plans/:planId/steps/:stepId/uncomplete`
  - `DELETE /care-plans/:planId/steps/:stepId`
  All owner-scoped by `userId` in the repository queries.
- `services/plants/helpers/execute-plant-care.ts`: optional `carePlanStepId`,
  cross-completion after the care log is created.
- `services/ai-chat/tools/propose-care-plan.ts`; `ToolContext` gains
  `CarePlanRepository`; `ToolDeps` gains `timezone`.
- `services/ai-chat/tools/create-diagnosis.ts`: structured treatment steps,
  auto-plan, output gains `carePlanId`.
- `services/ai-chat/build-system-prompt.ts`: Care Plan Tool section + active
  plans block. `plant-chat.ts` loads the user's timezone and open plans.
- `services/ai-chat/persist-chat-completion.ts`: link `chatMessageId` on plans.
- Tests: repository mock + fixtures, tool test, accept / complete-step tests,
  execute-plant-care cross-completion test.

### app
- Hooks: `useCarePlans`, `usePlantCarePlans`, `useAcceptCarePlan`,
  `useCompleteCarePlanStep`, `useUncompleteCarePlanStep`, `useDismissCarePlan`,
  `useDeleteCarePlan`, `useDeleteCarePlanStep`.
- Chat: `CarePlanCard` (proposal card with Add to tasks / Added), registered in
  `tool-renderers.tsx` for `proposeCarePlan` and rendered under `DiagnosisCard`
  when the diagnosis output carries a `carePlanId`. `DiagnosisCard` accepts
  string or structured treatment steps (old messages persist strings).
- Care tab: `CarePlansSection` between Today and Upcoming. Care-typed steps use
  the same undo delay as tasks; free-text steps toggle immediately.
- Plant detail: `PlantCarePlans` block under the care schedule.
- i18n: `care.plans.*` and `chat.carePlan.*` in en and fr.

## Out of scope (v1)
Recurrence, editing steps before acceptance, general-chat proposals, semantic
dedup, caretaker access, reminders for plan steps, manual plan creation UI, web
and admin packages.
