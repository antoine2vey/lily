import { useMemo } from 'react'
import { useIconColors } from '@/hooks/useIconColors'
import { fonts } from '@/theme'

export function useMarkdownStyles() {
  const { isDark, textPrimary, primary } = useIconColors()

  return useMemo(
    () => ({
      body: {
        fontFamily: fonts.regular,
        color: textPrimary,
        fontSize: 14,
        lineHeight: 22,
      },
      heading1: {
        fontFamily: fonts.bold,
        color: textPrimary,
        fontSize: 24,
        lineHeight: 32,
        marginTop: 8,
        marginBottom: 4,
      },
      heading2: {
        fontFamily: fonts.bold,
        color: textPrimary,
        fontSize: 20,
        lineHeight: 28,
        marginTop: 8,
        marginBottom: 4,
      },
      heading3: {
        fontFamily: fonts.semiBold,
        color: textPrimary,
        fontSize: 18,
        lineHeight: 26,
        marginTop: 6,
        marginBottom: 2,
      },
      heading4: {
        fontFamily: fonts.semiBold,
        color: textPrimary,
        fontSize: 16,
        lineHeight: 24,
        marginTop: 4,
        marginBottom: 2,
      },
      strong: {
        fontFamily: fonts.bold,
      },
      em: {
        fontStyle: 'italic' as const,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 4,
      },
      bullet_list: {
        marginVertical: 2,
      },
      ordered_list: {
        marginVertical: 2,
      },
      list_item: {
        marginVertical: 1,
      },
      code_inline: {
        fontFamily: 'monospace',
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        borderRadius: 4,
        paddingHorizontal: 4,
        fontSize: 13,
        color: textPrimary,
      },
      code_block: {
        fontFamily: 'monospace',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        color: textPrimary,
      },
      fence: {
        fontFamily: 'monospace',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        color: textPrimary,
        borderWidth: 0,
      },
      blockquote: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        borderLeftWidth: 3,
        borderLeftColor: primary,
        paddingLeft: 12,
        marginVertical: 4,
      },
      link: {
        color: primary,
        textDecorationLine: 'underline' as const,
      },
      hr: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        height: 1,
        marginVertical: 8,
      },
    }),
    [isDark, textPrimary, primary]
  )
}
