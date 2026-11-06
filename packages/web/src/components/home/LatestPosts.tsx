import { Link } from '@tanstack/react-router'
import { Array } from 'effect'
import { fmt, useI18n } from '@/i18n'
import { categoryLabel } from '@/lib/blog'
import type { PostMeta } from '@/lib/posts'

const pad = (n: number) => String(n).padStart(2, '0')

interface Props {
  readonly posts: ReadonlyArray<PostMeta>
  readonly total: number
}

export function LatestPosts({ posts, total }: Props) {
  const { locale, m } = useI18n()
  const t = m.Blog
  return (
    <section className="m-blog m-cv" id="blog">
      <div className="m-wrap">
        <div className="m-blog-head" data-rv>
          <div>
            <p className="m-kicker">{t.kicker}</p>
            <h2 className="m-h2">{t.title}</h2>
          </div>
          <Link className="m-more" to="/$locale/blog" params={{ locale }}>
            {fmt(t.all, { n: total })}
            <svg aria-hidden="true">
              <use href="#m-arrow" />
            </svg>
          </Link>
        </div>
        <div className="m-posts" data-rv>
          {Array.map(posts, (post, i) => (
            <Link
              key={post.slug}
              className={`m-post t${i + 1}`}
              to="/$locale/blog/$slug"
              params={{ locale, slug: post.slug }}
            >
              <span className="big" aria-hidden="true">
                {pad(i + 1)}
              </span>
              <span className="cat">{categoryLabel(post.category)}</span>
              <h3>{post.title}</h3>
              <span className="go">
                <i>
                  <svg aria-hidden="true">
                    <use href="#m-arrow" />
                  </svg>
                </i>
                {t.read}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
