import { useTranslation } from 'react-i18next'

import { useLocalizationContext } from 'src/contexts/LocalizationContext'

export function useLocalization() {
  const { t } = useTranslation()
  const { language, setLanguage, isLoading, supportedLanguages } =
    useLocalizationContext()

  return {
    t,
    language,
    setLanguage,
    isLoading,
    supportedLanguages,
  }
}
