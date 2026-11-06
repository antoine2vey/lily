import { Link } from '@tanstack/react-router'
import { fmt, useI18n } from '@/i18n'
import { categoryLabel, formatPostDate } from '@/lib/blog'
import type { PostMeta } from '@/lib/posts'

export function PostCard({ post }: { post: PostMeta }) {
  const { locale, m } = useI18n()
  return (
    <Link
      to="/$locale/blog/$slug"
      params={{ locale, slug: post.slug }}
      className="group block h-full"
    >
      <article className="flex h-full flex-col rounded-3xl bg-surface p-6 ring-1 ring-line transition-[transform,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.25)]">
        <div className="mb-4 flex items-center gap-3 text-xs">
          <span className="rounded-full bg-tint px-3 py-1 font-semibold text-primary-dark capitalize dark:bg-chip dark:text-primary">
            {categoryLabel(post.category)}
          </span>
          <span className="text-muted">
            {fmt(m.BlogPost.minRead, { minutes: post.readingTime })}
          </span>
        </div>
        <h2 className="mb-3 text-lg leading-snug font-bold text-ink transition-colors group-hover:text-primary-dark dark:group-hover:text-primary">
          {post.title}
        </h2>
        <p className="flex-1 text-sm leading-relaxed text-ink-2">
          {post.description}
        </p>
        <time dateTime={post.date} className="mt-4 block text-xs text-muted">
          {formatPostDate(locale, post.date, 'short')}
        </time>
      </article>
    </Link>
  )
}
