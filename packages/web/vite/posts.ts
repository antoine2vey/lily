import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Array, DateTime, Option, Order, pipe, Schema, String } from 'effect'
import matter from 'gray-matter'
import readingTime from 'reading-time'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import type { Plugin } from 'vite'
import { type Locale, locales } from '../src/i18n'
import { PostMeta } from '../src/lib/posts'

const CONTENT = join(import.meta.dirname, '..', 'content', 'posts')
const INDEX_ID = 'virtual:post-index/'

interface HastNode {
  type: string
  tagName?: string
  children?: HastNode[]
}

const demoteH1 = () => (tree: HastNode) => {
  const walk = (node: HastNode): void => {
    if (node.type === 'element' && node.tagName === 'h1') node.tagName = 'h2'
    Array.forEach(node.children ?? [], walk)
  }
  walk(tree)
}

const markdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(demoteH1)
  .use(rehypeSlug)
  .use(rehypeStringify)

const decodeMeta = Schema.decodeUnknownSync(PostMeta)

const parse = (file: string) => {
  const { data, content } = matter(readFileSync(file, 'utf8'))
  const slug = pipe(
    file,
    String.split('/'),
    Array.lastNonEmpty,
    String.replace(/\.mdx$/, '')
  )
  const meta = decodeMeta({
    ...data,
    slug,
    readingTime: Math.ceil(readingTime(content).minutes),
  })
  return { meta, content }
}

const byDateDesc = Order.flip(
  Order.mapInput(DateTime.Order, (p: PostMeta) =>
    pipe(
      DateTime.make(p.date),
      Option.getOrElse(() => DateTime.makeUnsafe(0))
    )
  )
)

export const loadPostIndex = (locale: Locale): ReadonlyArray<PostMeta> =>
  pipe(
    readdirSync(join(CONTENT, locale)),
    Array.filter(String.endsWith('.mdx')),
    Array.map((name) => parse(join(CONTENT, locale, name)).meta),
    Array.sort(byDateDesc)
  )

export const postsPlugin = (): Plugin => ({
  name: 'lily:posts',
  enforce: 'pre',
  resolveId: (id) => (String.startsWith(INDEX_ID)(id) ? `\0${id}` : undefined),
  load(id) {
    if (!String.startsWith(`\0${INDEX_ID}`)(id)) return undefined
    const locale = id.slice(INDEX_ID.length + 1)
    if (!Array.contains(locales, locale))
      return this.error(`unknown post index ${id}`)
    const dir = join(CONTENT, locale)
    for (const name of readdirSync(dir))
      if (String.endsWith('.mdx')(name)) this.addWatchFile(join(dir, name))
    return `export default ${JSON.stringify(loadPostIndex(locale as Locale))}`
  },
  transform(_code, id) {
    if (!id.endsWith('.mdx')) return undefined
    const { meta, content } = parse(id)
    const html = markdown.processSync(content).toString()
    return {
      code: `export default ${JSON.stringify({ meta, html })}`,
      map: null,
    }
  },
})
