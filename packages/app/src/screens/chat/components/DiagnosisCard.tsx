import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface DiagnosisResult {
  diagnosisId: string
  diseaseName: string
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
  confidence: number
  symptoms: string[]
  treatmentSteps: string[]
  preventionTips?: string[]
}

interface DiagnosisCardProps {
  diagnosis: DiagnosisResult
  /**
   * Replaces the static numbered treatment list. Used to embed the care plan
   * (steps + "Add to tasks") so a diagnosis renders as one card, not two.
   */
  treatmentSlot?: ReactNode
  /**
   * `card`: bordered bubble with its own title (legacy inline use).
   * `sheet`: content only, for a bottom sheet that already shows the title.
   */
  presentation?: 'card' | 'sheet'
}

const getSeverityColor = (severity: string): string =>
  pipe(
    Match.value(severity),
    Match.when('LOW', () => 'bg-success'),
    Match.when('MODERATE', () => 'bg-warning'),
    Match.when('HIGH', () => 'bg-coral'),
    Match.when('CRITICAL', () => 'bg-error'),
    Match.orElse(() => 'bg-text-muted')
  )

const getSeverityTextColor = (severity: string): string =>
  pipe(
    Match.value(severity),
    Match.when('LOW', () => 'text-success'),
    Match.when('MODERATE', () => 'text-warning'),
    Match.when('HIGH', () => 'text-coral'),
    Match.when('CRITICAL', () => 'text-error'),
    Match.orElse(() => 'text-text-muted')
  )

export function DiagnosisCard({
  diagnosis,
  treatmentSlot,
  presentation = 'card',
}: DiagnosisCardProps) {
  const iconColors = useIconColors()
  const severityBgColor = getSeverityColor(diagnosis.severity)
  const severityTextColor = getSeverityTextColor(diagnosis.severity)

  const isSheet = presentation === 'sheet'

  return (
    <View
      className={
        isSheet
          ? 'pb-2'
          : 'bg-surface dark:bg-surface-dark rounded-lg p-4 border border-border dark:border-slate-700 my-2'
      }
    >
      {/* Header: the sheet already shows the title, keep only the severity */}
      <View
        className={`flex-row items-center mb-3 ${isSheet ? 'justify-end' : 'justify-between'}`}
      >
        {!isSheet && (
          <View className="flex-1 mr-2">
            <Text
              className="text-base font-semibold text-text-primary dark:text-white"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {diagnosis.diseaseName}
            </Text>
          </View>
        )}
        <View className={`px-2.5 py-1 rounded-full ${severityBgColor}`}>
          <Text
            className="text-xs font-semibold text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {diagnosis.severity}
          </Text>
        </View>
      </View>

      {/* Confidence */}
      <View className="mb-3">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
            Confidence
          </Text>
          <Text className={`text-xs font-semibold ${severityTextColor}`}>
            {diagnosis.confidence}%
          </Text>
        </View>
        <View className="h-2 bg-border dark:bg-slate-700 rounded-full overflow-hidden">
          <View
            className={`h-full rounded-full ${severityBgColor}`}
            style={{ width: `${diagnosis.confidence}%` }}
          />
        </View>
      </View>

      {/* Symptoms */}
      <View className="mb-3">
        <Text
          className="text-xs text-text-muted dark:text-slate-400 uppercase tracking-wide mb-1.5"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          Symptoms
        </Text>
        {diagnosis.symptoms.map((symptom) => (
          <View key={symptom} className="flex-row items-start mb-1">
            <Text className="text-text-muted dark:text-slate-400 mr-2">
              {'\u2022'}
            </Text>
            <Text className="text-sm text-text-primary dark:text-white flex-1 font-regular">
              {symptom}
            </Text>
          </View>
        ))}
      </View>

      {/* Treatment Steps */}
      <View className="mb-3">
        <Text
          className="text-xs text-text-muted dark:text-slate-400 uppercase tracking-wide mb-1.5"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          Treatment
        </Text>
        {treatmentSlot ??
          diagnosis.treatmentSteps.map((step, idx) => (
            <View key={step} className="flex-row items-start mb-1">
              <Text
                className="text-primary dark:text-primary-light mr-2 text-sm font-semibold"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', minWidth: 20 }}
              >
                {idx + 1}.
              </Text>
              <Text className="text-sm text-text-primary dark:text-white flex-1 font-regular">
                {step}
              </Text>
            </View>
          ))}
      </View>
    </View>
  )
}
