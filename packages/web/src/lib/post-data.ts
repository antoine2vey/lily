import type { Locale } from '@/i18n'
import type { Post, PostMeta } from './posts'

const indexes: Record<
  Locale,
  () => Promise<{ default: ReadonlyArray<PostMeta> }>
> = {
  en: () => import('virtual:post-index/en'),
  fr: () => import('virtual:post-index/fr'),
}

export const postIndex = async (
  locale: Locale
): Promise<ReadonlyArray<PostMeta>> => (await indexes[locale]()).default

const bodies = import.meta.glob<{ default: Post }>('/content/posts/*/*.mdx')

const bodyKey = (locale: Locale, slug: string) =>
  `/content/posts/${locale}/${slug}.mdx`

export const hasPost = (locale: Locale, slug: string): boolean =>
  bodyKey(locale, slug) in bodies

export const loadPost = async (
  locale: Locale,
  slug: string
): Promise<Post | undefined> => {
  const load = bodies[bodyKey(locale, slug)]
  return load ? (await load()).default : undefined
}
