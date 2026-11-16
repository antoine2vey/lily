/**
 * Renders the ICU plural blocks of one argument, such as
 * `{count, plural, =0 {none} one {# day} other {# days}}`, the way the app's
 * i18next ICU backend does for English.
 */
export const renderPlurals = (
  template: string,
  name: string,
  value: unknown
): string =>
  template.replace(
    new RegExp(
      `\\{${name}, plural,((?:\\s*(?:=\\d+|\\w+)\\s*\\{[^{}]*\\})+)\\s*\\}`,
      'g'
    ),
    (_match, branches: string) => {
      const pick = (branch: string) =>
        new RegExp(`(?:^|\\s)${branch}\\s*\\{([^{}]*)\\}`).exec(branches)?.[1]
      const text =
        pick(`=${String(value)}`) ??
        (value === 1 ? pick('one') : undefined) ??
        pick('other') ??
        ''
      return text.replace(/#/g, String(value))
    }
  )
