import Image from 'next/image'
import Link from 'next/link'
import type { PostMeta } from '@/lib/posts'

function formatDate(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  )
}

export function BlogPostCard({
  post,
  locale,
}: {
  post: PostMeta
  locale: string
}) {
  return (
    <Link href={`/${locale}/blog/${post.slug}`} className="group block">
      <article className="shadow-neu bg-background rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-neu-lg h-full flex flex-col">
        {post.coverImage && (
          <div className="relative w-full aspect-[16/9] overflow-hidden">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        )}
        <div className="p-6 flex flex-col flex-1">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold text-primary bg-primary-tint px-3 py-1 rounded-full capitalize">
              {post.category.replace('-', ' ')}
            </span>
            <span className="text-xs text-muted">
              {post.readingTime} min read
            </span>
          </div>
          <h2 className="text-lg font-bold text-lily-text mb-3 leading-snug group-hover:text-primary transition-colors">
            {post.title}
          </h2>
          <p className="text-sm text-muted leading-relaxed flex-1">
            {post.description}
          </p>
          <time dateTime={post.date} className="text-xs text-muted mt-4 block">
            {formatDate(post.date, locale)}
          </time>
        </div>
      </article>
    </Link>
  )
}
