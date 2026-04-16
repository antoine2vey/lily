import { MaterialIcons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { Match, pipe } from 'effect'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import { useEffectMutation } from '@/utils/client'

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
  plantId?: string | undefined
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

export function DiagnosisCard({ diagnosis, plantId }: DiagnosisCardProps) {
  const iconColors = useIconColors()
  const queryClient = useQueryClient()

  const resolveMutation = useEffectMutation('diagnosis', 'resolveDiagnosis', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnosis'] })
    },
  })

  const severityBgColor = getSeverityColor(diagnosis.severity)
  const severityTextColor = getSeverityTextColor(diagnosis.severity)

  return (
    <View className="bg-surface dark:bg-surface-dark rounded-lg p-4 border border-border dark:border-slate-700 my-2">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1 mr-2">
          <Text
            className="text-base font-semibold text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {diagnosis.diseaseName}
          </Text>
        </View>
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
        {diagnosis.treatmentSteps.map((step, idx) => (
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

      {/* Prevention Tips */}
      {diagnosis.preventionTips && diagnosis.preventionTips.length > 0 && (
        <View className="mb-3">
          <Text
            className="text-xs text-text-muted dark:text-slate-400 uppercase tracking-wide mb-1.5"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            Prevention
          </Text>
          {diagnosis.preventionTips.map((tip) => (
            <View key={tip} className="flex-row items-start mb-1">
              <MaterialIcons
                name="shield"
                size={14}
                color={iconColors.primary}
                style={{ marginRight: 6, marginTop: 2 }}
              />
              <Text className="text-sm text-text-primary dark:text-white flex-1 font-regular">
                {tip}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Resolve Button */}
      {!resolveMutation.isSuccess && (
        <Pressable
          onPress={() =>
            resolveMutation.mutate({
              path: {
                plantId: plantId ?? '',
                diagnosisId: diagnosis.diagnosisId,
              },
            })
          }
          disabled={resolveMutation.isPending}
          className="flex-row items-center justify-center py-2.5 rounded-md bg-primary-tint dark:bg-primary/20 mt-1"
        >
          {resolveMutation.isPending ? (
            <ActivityIndicator size="small" color={iconColors.primary} />
          ) : (
            <>
              <MaterialIcons
                name="check-circle"
                size={18}
                color={iconColors.primary}
              />
              <Text
                className="text-sm font-semibold text-primary ml-1.5"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                Mark Resolved
              </Text>
            </>
          )}
        </Pressable>
      )}

      {resolveMutation.isSuccess && (
        <View className="flex-row items-center justify-center py-2.5 rounded-md bg-success/10 mt-1">
          <MaterialIcons
            name="check-circle"
            size={18}
            color={iconColors.primary}
          />
          <Text
            className="text-sm font-semibold text-success ml-1.5"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            Resolved
          </Text>
        </View>
      )}
    </View>
  )
}
