import type { CareType } from '@lily/shared'
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import { Array, Match, Option, Predicate, pipe } from 'effect'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import { View } from 'react-native'

import { CarePlanCard, type ProposedStep } from './CarePlanCard'
import { DiagnosisCard } from './DiagnosisCard'
import { ToolLoadingIndicator } from './ToolLoadingIndicator'
import { ToolResultSummary } from './ToolResultSummary'
import { CarePlanStatusBadge, SeverityBadge } from './ToolStatusBadges'

type AnyToolPart = ToolUIPart | DynamicToolUIPart

type ToolBubbleRenderer = (
  part: AnyToolPart,
  index: number,
  t: TFunction<'chat'>
) => Option.Option<ReactElement>

export interface ToolRenderContext {
  readonly t: TFunction<'chat'>
  readonly plantId?: string | undefined
  /** Result id (diagnosisId / carePlanId) whose sheet should open on its own. */
  readonly autoOpenToolId?: string | null | undefined
  readonly onAutoOpenHandled?: (() => void) | undefined
}

type ToolFullWidthRenderer = (
  part: AnyToolPart,
  index: number,
  ctx: ToolRenderContext
) => Option.Option<ReactElement>

/**
 * The id a tool result is identified by for auto-opening: the diagnosis id
 * for `createDiagnosis`, the plan id for `proposeCarePlan`.
 */
export const toolResultId = (part: AnyToolPart): Option.Option<string> => {
  if (part.state !== 'output-available') return Option.none()
  const output = part.output as {
    diagnosisId?: string
    carePlanId?: string
  } | null
  return pipe(
    Option.fromNullable(output),
    Option.flatMap((o) =>
      Option.orElse(Option.fromNullable(o.diagnosisId), () =>
        Option.fromNullable(o.carePlanId)
      )
    )
  )
}

/** Tools whose completed output renders as a full-width card below the text. */
export const FULL_WIDTH_TOOLS: ReadonlyArray<string> = [
  'createDiagnosis',
  'proposeCarePlan',
]

// The tool input carries an explicit "none" care type (the model must decide);
// the UI only cares about the four real types.
interface RawStepInput {
  title: string
  description?: string
  careType?: CareType | 'none'
  dueInDays?: number
}

const normalizeStep = (step: RawStepInput): ProposedStep => ({
  title: step.title,
  description: step.description,
  careType: step.careType === 'none' ? undefined : step.careType,
  dueInDays: step.dueInDays,
})

// Treatment steps were plain strings before care plans existed; persisted
// messages from that era still carry strings, so both shapes are accepted.
type TreatmentStepInput = string | RawStepInput

const toProposedStep = (step: TreatmentStepInput): ProposedStep =>
  pipe(
    Match.value(step),
    Match.when(Predicate.isString, (title): ProposedStep => ({ title })),
    Match.orElse(normalizeStep)
  )

interface DiagnosisInput {
  diseaseName: string
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
  confidence: number
  symptoms: string[]
  treatmentSteps: TreatmentStepInput[]
  preventionTips?: string[]
}

interface DiagnosisOutput {
  diagnosisId: string
  carePlanId?: string
}

interface CarePlanInput {
  title: string
  steps: RawStepInput[]
}

interface CarePlanOutput {
  carePlanId: string
  plantId: string
}

const makeLoadingBubble =
  (
    labelKey: 'analyzing' | 'searching' | 'planning',
    keyPrefix: string
  ): ToolBubbleRenderer =>
  (part, index, t) =>
    pipe(
      Match.value(part.state),
      Match.when(
        'input-streaming',
        (): Option.Option<ReactElement> =>
          Option.some(
            <ToolLoadingIndicator
              key={`${keyPrefix}-${index}`}
              label={t(labelKey)}
            />
          )
      ),
      Match.when(
        'input-available',
        (): Option.Option<ReactElement> =>
          Option.some(
            <ToolLoadingIndicator
              key={`${keyPrefix}-${index}`}
              label={t(labelKey)}
            />
          )
      ),
      Match.orElse((): Option.Option<ReactElement> => Option.none())
    )

const createDiagnosisBubble = makeLoadingBubble('analyzing', 'loading')

const createDiagnosisFullWidth: ToolFullWidthRenderer = (
  part,
  index,
  { t, plantId, autoOpenToolId, onAutoOpenHandled }
) => {
  if (part.state !== 'output-available') return Option.none()
  const input = part.input as DiagnosisInput
  const output = part.output as DiagnosisOutput
  const steps = Array.map(input.treatmentSteps, toProposedStep)
  // A diagnosis-born plan replaces the static treatment list so the steps
  // appear once, with the "Add to tasks" action, inside the same card.
  const treatmentSlot = pipe(
    Option.fromNullable(output.carePlanId),
    Option.map((carePlanId) => (
      <CarePlanCard
        key={`diagnosis-plan-${index}`}
        carePlanId={carePlanId}
        title={input.diseaseName}
        steps={steps}
        plantId={plantId}
        presentation="section"
      />
    )),
    Option.getOrUndefined
  )
  return Option.some(
    <ToolResultSummary
      key={`diagnosis-${index}`}
      testID={`diagnosis-summary-${output.diagnosisId}`}
      icon="healing"
      title={input.diseaseName}
      subtitle={t('summary.diagnosisSubtitle', { count: steps.length })}
      badge={
        <View className="flex-row items-center gap-1">
          <SeverityBadge severity={input.severity} />
          {output.carePlanId && (
            <CarePlanStatusBadge
              carePlanId={output.carePlanId}
              plantId={plantId}
            />
          )}
        </View>
      }
      buttonLabel={t('summary.viewDiagnosis')}
      sheetTitle={input.diseaseName}
      autoOpen={autoOpenToolId === output.diagnosisId}
      onAutoOpenHandled={onAutoOpenHandled}
    >
      <DiagnosisCard
        diagnosis={{
          ...input,
          treatmentSteps: Array.map(steps, (s) => s.title),
          diagnosisId: output.diagnosisId,
        }}
        treatmentSlot={treatmentSlot}
        presentation="sheet"
      />
    </ToolResultSummary>
  )
}

const proposeCarePlanBubble = makeLoadingBubble('planning', 'planning')

const proposeCarePlanFullWidth: ToolFullWidthRenderer = (
  part,
  index,
  { t, plantId, autoOpenToolId, onAutoOpenHandled }
) => {
  if (part.state !== 'output-available') return Option.none()
  const input = part.input as CarePlanInput
  const output = part.output as CarePlanOutput
  const steps = Array.map(input.steps, normalizeStep)
  return Option.some(
    <ToolResultSummary
      key={`care-plan-${index}`}
      testID={`care-plan-summary-${output.carePlanId}`}
      icon="checklist"
      title={input.title}
      subtitle={t('carePlan.stepsCount', { count: steps.length })}
      badge={
        <CarePlanStatusBadge carePlanId={output.carePlanId} plantId={plantId} />
      }
      buttonLabel={t('summary.viewPlan')}
      sheetTitle={input.title}
      autoOpen={autoOpenToolId === output.carePlanId}
      onAutoOpenHandled={onAutoOpenHandled}
    >
      <CarePlanCard
        carePlanId={output.carePlanId}
        title={input.title}
        steps={steps}
        plantId={plantId}
        presentation="section"
      />
    </ToolResultSummary>
  )
}

const searchPlantKnowledgeBubble = makeLoadingBubble('searching', 'searching')

export const toolBubbleRenderers: Record<string, ToolBubbleRenderer> = {
  createDiagnosis: createDiagnosisBubble,
  proposeCarePlan: proposeCarePlanBubble,
  searchPlantKnowledge: searchPlantKnowledgeBubble,
}

export const toolFullWidthRenderers: Record<string, ToolFullWidthRenderer> = {
  createDiagnosis: createDiagnosisFullWidth,
  proposeCarePlan: proposeCarePlanFullWidth,
}
