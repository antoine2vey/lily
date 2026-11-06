import { Array, pipe, String } from 'effect'
import type { ReactNode } from 'react'

export type Block =
  | string
  | { readonly title?: string; readonly list: ReadonlyArray<string> }

export interface DocSection {
  readonly heading: string
  readonly blocks: ReadonlyArray<Block>
}

const EMAIL = /([\w.+-]+@withlily\.app)/

const linkEmails = (text: string): ReactNode =>
  pipe(
    text,
    String.split(EMAIL),
    Array.map((part, i) =>
      i % 2 === 1 ? (
        <a
          key={part}
          href={`mailto:${part}`}
          className="font-medium text-primary-dark underline-offset-2 hover:underline dark:text-primary"
        >
          {part}
        </a>
      ) : (
        part
      )
    )
  )

function BlockView({ block }: { block: Block }) {
  if (typeof block === 'string') return <p>{linkEmails(block)}</p>
  return (
    <div>
      {block.title && (
        <h3 className="mb-2 text-lg font-semibold text-ink">{block.title}</h3>
      )}
      <ul className="list-disc space-y-2 pl-6 marker:text-primary">
        {Array.map(block.list, (item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function Section({
  section,
  children,
}: {
  section: DocSection
  children?: ReactNode
}) {
  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold tracking-tight text-ink">
        {section.heading}
      </h2>
      <div className="space-y-4">
        {Array.map(section.blocks, (block, i) => (
          <BlockView
            key={typeof block === 'string' ? block : (block.title ?? i)}
            block={block}
          />
        ))}
        {children}
      </div>
    </section>
  )
}

export function DocPage({
  title,
  lead,
  meta,
  children,
}: {
  title: string
  lead?: string
  meta?: string
  children: ReactNode
}) {
  return (
    <main className="px-5 pt-32 pb-24">
      <article className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {title}
        </h1>
        {meta && <p className="mb-6 text-sm text-muted">{meta}</p>}
        {lead && (
          <p className="mb-12 text-lg leading-relaxed text-ink-2">{lead}</p>
        )}
        <div className="space-y-12 leading-relaxed text-ink-2">{children}</div>
      </article>
    </main>
  )
}
