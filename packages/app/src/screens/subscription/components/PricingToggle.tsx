import { Pressable, Text, View } from 'react-native'

type BillingPeriod = 'monthly' | 'annual'

interface PricingToggleProps {
  selected: BillingPeriod
  onSelect: (period: BillingPeriod) => void
  monthlyPrice: string
  annualPrice: string
  savingsPercent?: number
}

export function PricingToggle({
  selected,
  onSelect,
  monthlyPrice,
  annualPrice,
  savingsPercent,
}: PricingToggleProps) {
  const isMonthlySelected = selected === 'monthly'
  const isAnnualSelected = selected === 'annual'

  return (
    <View className="flex-row px-4">
      {/* Monthly Option */}
      <Pressable
        onPress={() => onSelect('monthly')}
        className={`flex-1 mr-2 p-4 rounded-xl items-center border-2 ${
          isMonthlySelected
            ? 'bg-primary-tint border-primary'
            : 'bg-surface border-border'
        }`}
      >
        <Text
          className={`text-sm mb-1 font-medium ${
            isMonthlySelected ? 'text-primary' : 'text-text-muted'
          }`}
        >
          Monthly
        </Text>
        <Text
          className={`text-xl font-bold ${
            isMonthlySelected ? 'text-primary' : 'text-text-primary'
          }`}
        >
          {monthlyPrice}
        </Text>
      </Pressable>

      {/* Annual Option */}
      <Pressable
        onPress={() => onSelect('annual')}
        className={`flex-1 ml-2 p-4 rounded-xl items-center relative border-2 ${
          isAnnualSelected
            ? 'bg-primary-tint border-primary'
            : 'bg-surface border-border'
        }`}
      >
        {/* Savings Badge */}
        {savingsPercent && (
          <View className="absolute -top-3 right-2 px-2 py-0.5 rounded-full bg-achievement-gold">
            <Text className="text-xs font-semibold text-text-primary">
              SAVE {savingsPercent}%
            </Text>
          </View>
        )}
        <Text
          className={`text-sm mb-1 font-medium ${
            isAnnualSelected ? 'text-primary' : 'text-text-muted'
          }`}
        >
          Annual
        </Text>
        <Text
          className={`text-xl font-bold ${
            isAnnualSelected ? 'text-primary' : 'text-text-primary'
          }`}
        >
          {annualPrice}
        </Text>
        <Text className="text-xs mt-0.5 font-regular text-text-muted">
          per year
        </Text>
      </Pressable>
    </View>
  )
}
