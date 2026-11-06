import type { ReactNode } from 'react'

export type Mascot = 'celebrate' | 'jump' | 'send-envelope'

interface Props {
  readonly eyebrow: string
  readonly title: ReactNode
  readonly lead?: string
  readonly mascot?: Mascot
}

// Opening block of a document page. Renders the page's only h1.
export function PageHero({ eyebrow, title, lead, mascot }: Props) {
  return (
    <section className="mag m-page-hero">
      <div className="m-wrap">
        {mascot ? (
          <img
            className="mascot"
            src={`/mascot/${mascot}.webp`}
            alt=""
            aria-hidden="true"
            decoding="async"
            width="170"
            height="170"
          />
        ) : null}
        <p className="m-kicker">{eyebrow}</p>
        <h1 className="m-h2">{title}</h1>
        {lead ? <p className="m-lede">{lead}</p> : null}
      </div>
    </section>
  )
}
