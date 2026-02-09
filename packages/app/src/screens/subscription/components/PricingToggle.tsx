import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'

type BillingPeriod = 'monthly' | 'annual'

interface PricingToggleProps {
  selected: BillingPeriod
  onSelect: (period: BillingPeriod) => void
  monthlyPrice: string
  annualPrice: string
  savingsPercent?: number
  trialText?: string
}

export function PricingToggle({
  selected,
  onSelect,
  monthlyPrice,
  annualPrice,
  savingsPercent,
  trialText,
}: PricingToggleProps) {
  const { t } = useTranslation('subscription')
  const isMonthlySelected = selected === 'monthly'
  const isAnnualSelected = selected === 'annual'

  return (
    <View className="flex-row px-4 gap-3">
      {/* Monthly Option */}
      <Pressable
        onPress={() => onSelect('monthly')}
        className={`flex-1 p-4 rounded-2xl border-2 min-h-[110px] justify-between ${
          isMonthlySelected
            ? 'bg-primary-tint dark:bg-primary/20 border-primary'
            : 'bg-surface dark:bg-surface-dark border-border/50 dark:border-slate-700/50'
        }`}
      >
        <View className="flex-row justify-between items-start">
          <Text
            className={`text-sm font-bold ${
              isMonthlySelected
                ? 'text-primary'
                : 'text-text-muted dark:text-slate-400'
            }`}
          >
            {t('pricing.monthly')}
          </Text>
          <View
            className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
              isMonthlySelected
                ? 'bg-primary border-primary'
                : 'border-border dark:border-slate-600'
            }`}
          >
            {isMonthlySelected && (
              <MaterialIcons name="check" size={12} color="white" />
            )}
          </View>
        </View>
        <View>
          <Text
            className={`text-2xl font-bold ${
              isMonthlySelected
                ? 'text-text-primary dark:text-white'
                : 'text-text-primary dark:text-white'
            }`}
          >
            {monthlyPrice}
          </Text>
          <Text className="text-[10px] font-medium text-text-muted dark:text-slate-400">
            {t('pricing.perMonth')}
          </Text>
        </View>
        {trialText && (
          <Text className="text-[10px] font-bold text-primary mt-1">
            {trialText}
          </Text>
        )}
      </Pressable>

      {/* Annual Option */}
      <Pressable
        onPress={() => onSelect('annual')}
        className={`flex-1 p-4 rounded-2xl border-2 min-h-[110px] justify-between relative ${
          isAnnualSelected
            ? 'bg-primary-tint dark:bg-primary/20 border-primary'
            : 'bg-surface dark:bg-surface-dark border-border/50 dark:border-slate-700/50'
        }`}
      >
        {/* Savings Badge */}
        {savingsPercent && (
          <View className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary z-10">
            <Text className="text-[10px] font-bold uppercase text-white">
              {t('pricing.save', { percent: savingsPercent })}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between items-start">
          <Text
            className={`text-sm font-bold ${
              isAnnualSelected
                ? 'text-primary'
                : 'text-text-muted dark:text-slate-400'
            }`}
          >
            {t('pricing.annual')}
          </Text>
          <View
            className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
              isAnnualSelected
                ? 'bg-primary border-primary'
                : 'border-border dark:border-slate-600'
            }`}
          >
            {isAnnualSelected && (
              <MaterialIcons name="check" size={12} color="white" />
            )}
          </View>
        </View>
        <View>
          <Text
            className={`text-2xl font-bold ${
              isAnnualSelected
                ? 'text-text-primary dark:text-white'
                : 'text-text-primary dark:text-white'
            }`}
          >
            {annualPrice}
          </Text>
          <Text className="text-[10px] font-medium text-text-muted dark:text-slate-400">
            {t('pricing.perYear')}
          </Text>
        </View>
        {trialText && (
          <Text className="text-[10px] font-bold text-primary mt-1">
            {trialText}
          </Text>
        )}
      </Pressable>
    </View>
  )
}
