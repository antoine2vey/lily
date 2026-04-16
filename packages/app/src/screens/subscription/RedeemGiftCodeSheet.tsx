import { Match, pipe, String } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { Input } from '@/components/ui/Input'
import { useIconColors } from '@/hooks/useIconColors'
import { useRedeemGiftCode } from '@/hooks/useRedeemGiftCode'

interface RedeemGiftCodeSheetProps {
  visible: boolean
  onClose: () => void
}

export function RedeemGiftCodeSheet({
  visible,
  onClose,
}: RedeemGiftCodeSheetProps) {
  const { t } = useTranslation(['subscription'])
  const iconColors = useIconColors()
  const [code, setCode] = useState('')
  const {
    mutate: redeem,
    isPending,
    data,
    apiError,
    isApiError,
    reset,
  } = useRedeemGiftCode()

  const canSubmit = String.isNonEmpty(String.trim(code)) && !isPending && !data

  const errorMessage = apiError
    ? pipe(
        Match.value(apiError._tag),
        Match.when('GiftCodeNotFoundError', () =>
          t('subscription:redeem.errors.notFound')
        ),
        Match.when('GiftCodeInactiveError', () =>
          t('subscription:redeem.errors.inactive')
        ),
        Match.when('GiftCodeExpiredError', () =>
          t('subscription:redeem.errors.expired')
        ),
        Match.when('GiftCodeExhaustedError', () =>
          t('subscription:redeem.errors.exhausted')
        ),
        Match.when('GiftCodeAlreadyRedeemedError', () =>
          t('subscription:redeem.errors.alreadyRedeemed')
        ),
        Match.orElse(() => t('subscription:redeem.error'))
      )
    : null

  const handleRedeem = () => {
    if (!canSubmit) return
    redeem({ payload: { code: code.trim() } })
  }

  const handleClose = () => {
    setCode('')
    reset()
    onClose()
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={t('subscription:redeem.title')}
      snapPoints={['45%']}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 pb-4">
          <Text className="text-sm text-text-secondary dark:text-slate-400">
            {t('subscription:redeem.description')}
          </Text>

          {data && (
            <View className="rounded-xl p-4 bg-primary-tint dark:bg-primary/20">
              <Text
                className="text-primary text-center"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('subscription:redeem.success')}
              </Text>
            </View>
          )}

          {isApiError && errorMessage && (
            <View className="rounded-xl p-4 bg-error/10">
              <Text className="text-error text-sm text-center">
                {errorMessage}
              </Text>
            </View>
          )}

          <View className="gap-2">
            <Text className="text-sm font-semibold text-text-primary dark:text-white pl-1">
              {t('subscription:redeem.inputLabel')}
            </Text>
            <Input
              value={code}
              onChangeText={(text) => setCode(text.toUpperCase())}
              placeholder={t('subscription:redeem.inputPlaceholder')}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isPending && !data}
              autoFocus
              icon="card-giftcard"
            />
          </View>

          {data ? (
            <Pressable
              onPress={handleClose}
              className="h-14 rounded-xl items-center justify-center bg-primary"
            >
              <Text className="text-base font-semibold text-white">
                {t('subscription:redeem.doneButton')}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleRedeem}
              disabled={!canSubmit}
              className={`h-14 rounded-xl items-center justify-center ${
                canSubmit ? 'bg-primary' : 'bg-primary/50'
              }`}
            >
              {isPending ? (
                <ActivityIndicator color={iconColors.white} />
              ) : (
                <Text className="text-base font-semibold text-white">
                  {t('subscription:redeem.redeemButton')}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  )
}
