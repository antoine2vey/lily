import fs from 'node:fs'
import path from 'node:path'
import { Array, DateTime, Option, Order, pipe, Schema, String } from 'effect'
import matter from 'gray-matter'
import readingTime from 'reading-time'

const PostMetaSchema = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  date: Schema.String,
  slug: Schema.String,
  category: Schema.String,
  tags: Schema.mutable(Schema.Array(Schema.String)),
  coverImage: Schema.optional(Schema.String),
  readingTime: Schema.optional(Schema.Number),
})

export interface PostMeta {
  title: string
  description: string
  date: string
  slug: string
  category: string
  tags: string[]
  coverImage?: string
  readingTime?: number
}

export interface Post extends PostMeta {
  content: string
  readingTimeMinutes: number
}

function getPostsDirectory(locale: string) {
  return path.join(process.cwd(), 'content/posts', locale)
}

export function getAllPosts(locale = 'en'): PostMeta[] {
  const dir = getPostsDirectory(locale)
  if (!fs.existsSync(dir)) return []

  return pipe(
    fs.readdirSync(dir),
    Array.filter(String.endsWith('.mdx')),
    Array.map((file) => {
      const source = fs.readFileSync(path.join(dir, file), 'utf8')
      const slug = pipe(file, String.replace(/\.mdx$/, ''))
      const { data, content } = matter(source)
      const stats = readingTime(content)
      return Schema.decodeUnknownSync(PostMetaSchema)({
        ...data,
        slug,
        readingTime: Math.ceil(stats.minutes),
      })
    }),
    Array.sort(
      Order.reverse(
        Order.mapInput(DateTime.Order, (post: PostMeta) =>
          pipe(
            DateTime.make(post.date),
            Option.getOrElse(() => DateTime.unsafeNow())
          )
        )
      )
    )
  )
}

export function getPostBySlug(
  slug: string,
  locale = 'en'
): Option.Option<Post> {
  const dir = getPostsDirectory(locale)
  const fullPath = path.join(dir, `${slug}.mdx`)

  if (!fs.existsSync(fullPath)) {
    return Option.none()
  }

  const source = fs.readFileSync(fullPath, 'utf8')
  const { data, content } = matter(source)
  const stats = readingTime(content)

  return Option.some({
    ...Schema.decodeUnknownSync(PostMetaSchema)({ ...data, slug }),
    content,
    readingTimeMinutes: Math.ceil(stats.minutes),
  })
}
