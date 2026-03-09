import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import { Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'

import { DiagnosisCard } from './DiagnosisCard'
import { ToolLoadingIndicator } from './ToolLoadingIndicator'

type AnyToolPart = ToolUIPart | DynamicToolUIPart

type ToolBubbleRenderer = (
  part: AnyToolPart,
  index: number,
  t: TFunction<'chat'>
) => Option.Option<ReactElement>

type ToolFullWidthRenderer = (
  part: AnyToolPart,
  index: number,
  plantId?: string
) => Option.Option<ReactElement>

const makeLoadingBubble =
  (
    labelKey: 'analyzing' | 'searching',
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
  plantId
) => {
  if (part.state !== 'output-available') return Option.none()
  return Option.some(
    <DiagnosisCard
      key={`diagnosis-${index}`}
      diagnosis={{
        ...(part.input as {
          diseaseName: string
          severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
          confidence: number
          symptoms: string[]
          treatmentSteps: string[]
          preventionTips?: string[]
        }),
        diagnosisId: (part.output as { diagnosisId: string }).diagnosisId,
      }}
      plantId={plantId}
    />
  )
}

const searchPlantKnowledgeBubble = makeLoadingBubble('searching', 'searching')

export const toolBubbleRenderers: Record<string, ToolBubbleRenderer> = {
  createDiagnosis: createDiagnosisBubble,
  searchPlantKnowledge: searchPlantKnowledgeBubble,
}

export const toolFullWidthRenderers: Record<string, ToolFullWidthRenderer> = {
  createDiagnosis: createDiagnosisFullWidth,
}
