import { Array } from 'effect'
import { type ComponentType, Fragment, type ReactNode } from 'react'
import { useI18n } from '@/i18n'
import type { Messages } from '@/i18n/en'
import {
  AskScreen,
  CareScreen,
  Floor,
  LogScreen,
  Phone,
  ScanScreen,
  ShareScreen,
} from './phone'

type Tone = 'tint' | 'water' | 'coral' | 'gold' | 'leaf'
interface ScreenProps {
  readonly shot?: number
  readonly on?: boolean
}
interface Chapter {
  readonly tone: Tone
  readonly Screen: ComponentType<ScreenProps>
  readonly Ui: ComponentType<{ t: Messages['Story'] }>
}

const pad = (n: number) => String(n).padStart(2, '0')

function ScanUi({ t }: { t: Messages['Story'] }) {
  return (
    <>
      <div className="m-steps">
        {Array.map(t.scan.steps, (s, i) => (
          <Fragment key={s}>
            {i > 0 ? <span className="arr" /> : null}
            <span className={i === 0 ? 'm-step done' : 'm-step'}>
              <i>{i + 1}</i>
              {s}
            </span>
          </Fragment>
        ))}
      </div>
      <p className="m-note">{t.scan.note}</p>
      <p className="m-try">{t.scan.try}</p>
    </>
  )
}

const PILL_ICONS = ['#m-clock', '#m-widget', '#m-lock'] as const

function CareUi({ t }: { t: Messages['Story'] }) {
  return (
    <>
      <div className="m-weather">
        {Array.map(t.care.weather, (w) => (
          <div className="m-wx" key={w.title}>
            <span className="e" aria-hidden="true">
              {w.emoji}
            </span>
            <div>
              <b>{w.title}</b>
              <span>{w.body}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="m-pills">
        {Array.map(t.care.pills, (p, i) => (
          <span className="m-pill" key={p}>
            <svg aria-hidden="true">
              <use href={PILL_ICONS[i]} />
            </svg>
            {p}
          </span>
        ))}
      </div>
      <p className="m-try">{t.care.try}</p>
    </>
  )
}

function AskUi({ t }: { t: Messages['Story'] }) {
  return (
    <>
      <div className="m-chat">
        <p className="m-bub me">{t.ask.me}</p>
        <p className="m-bub lily">
          <small>
            <svg aria-hidden="true">
              <use href="#i-spark" />
            </svg>
            {t.ask.lilyName}
          </small>
          {t.ask.lily}
        </p>
      </div>
      <p className="m-try">{t.ask.try}</p>
    </>
  )
}

function LogUi({ t }: { t: Messages['Story'] }) {
  return (
    <>
      <div className="m-log">
        {Array.map(t.log.types, (name, i) => (
          <span key={name} className={i === 0 ? 'on' : undefined}>
            {i === 0 ? (
              <svg aria-hidden="true">
                <use href="#m-tick" />
              </svg>
            ) : null}
            {name}
          </span>
        ))}
      </div>
      <div className="m-grave">
        <span className="e" aria-hidden="true">
          🪦
        </span>
        <div>
          <b>{t.log.grave.name}</b>
          <span>{t.log.grave.cause}</span>
        </div>
        <em>{t.log.grave.back}</em>
      </div>
      <p className="m-grave-copy">{t.log.graveCopy}</p>
      <p className="m-try">{t.log.try}</p>
    </>
  )
}

function ShareUi({ t }: { t: Messages['Story'] }) {
  return (
    <>
      <ul className="m-rooms">
        {Array.map(t.share.rooms, (r) => (
          <li key={r.name}>
            <b>{r.name}</b>
            <span className="lux" aria-hidden="true">
              {Array.map(Array.range(0, 4), (i) => (
                <i key={i} className={i < r.lux ? 'on' : undefined} />
              ))}
            </span>
            <span>{r.meta}</span>
          </li>
        ))}
      </ul>
      <a className="m-more" href="#together">
        {t.share.more}
        <svg aria-hidden="true">
          <use href="#m-down" />
        </svg>
      </a>
      <p className="m-try">{t.share.try}</p>
    </>
  )
}

const CHAPTERS: ReadonlyArray<Chapter> = [
  { tone: 'tint', Screen: ScanScreen, Ui: ScanUi },
  { tone: 'water', Screen: CareScreen, Ui: CareUi },
  { tone: 'coral', Screen: AskScreen, Ui: AskUi },
  { tone: 'gold', Screen: LogScreen, Ui: LogUi },
  { tone: 'leaf', Screen: ShareScreen, Ui: ShareUi },
]
const COPY_KEYS = ['scan', 'care', 'ask', 'log', 'share'] as const
// Two sticky stories with the marquee between them: chapters 1 to 3, then 4
// and 5.
const STORIES = [
  [0, 1, 2],
  [3, 4],
] as const

function StoryBlock({
  label,
  chapters,
  t,
}: {
  label: string
  chapters: ReadonlyArray<number>
  t: Messages['Story']
}) {
  const first = chapters[0] ?? 0
  return (
    <section className="m-story" aria-label={label}>
      <div className="m-wrap m-story-grid">
        <div className="m-chapters">
          {Array.map(chapters, (k, i) => {
            const { tone, Screen, Ui } = CHAPTERS[k] as Chapter
            const copy = t[COPY_KEYS[k] as (typeof COPY_KEYS)[number]]
            return (
              <article
                key={k}
                className={i === 0 ? 'm-ch is-on' : 'm-ch'}
                id={`ch-${k + 1}`}
                data-i={i}
                data-k={k}
                data-tone={tone}
              >
                <span className="m-num" aria-hidden="true">
                  {pad(k + 1)}
                </span>
                <h3 className="m-ch-title">{copy.title}</h3>
                <p className="m-ch-body">{copy.body}</p>
                <div className="m-ui">
                  <Ui t={t} />
                </div>
                <figure className="m-inline">
                  <Floor />
                  <Phone>
                    <Screen on />
                  </Phone>
                </figure>
              </article>
            )
          })}
        </div>
        <div className="m-stick">
          <div
            className="m-stage"
            data-tone={(CHAPTERS[first] as Chapter).tone}
          >
            <div className="m-halo" />
            <Floor />
            <Phone>
              {Array.map(chapters, (k, i) => {
                const { Screen } = CHAPTERS[k] as Chapter
                return <Screen key={k} shot={i} on={i === 0} />
              })}
            </Phone>
          </div>
        </div>
      </div>
    </section>
  )
}

function Marquee({ t }: { t: Messages['Story']['marquee'] }) {
  // Each strip repeats its words so the loop joins seamlessly.
  const strip = (words: ReadonlyArray<string>, copies: ReadonlyArray<string>) =>
    Array.flatMap(copies, (c) =>
      Array.map(words, (word) => ({ key: `${c}-${word}`, word }))
    )
  const list = (items: ReadonlyArray<{ key: string; word: string }>) => (
    <ul>
      {Array.map(items, ({ key, word }) => (
        <li key={key}>{word}</li>
      ))}
    </ul>
  )
  return (
    <section className="m-marquee" aria-label={t.label}>
      <div className="m-mq">
        {list(strip(t.plants, ['a']))}
        <ul aria-hidden="true">
          {Array.map(t.plants, (word) => (
            <li key={word}>{word}</li>
          ))}
        </ul>
      </div>
      <div className="m-mq rev" aria-hidden="true">
        {list(strip(t.actions, ['a', 'b']))}
        {list(strip(t.actions, ['c', 'd']))}
      </div>
    </section>
  )
}

export function Story(): ReactNode {
  const { m } = useI18n()
  const t = m.Story
  return (
    <>
      <section className="m-intro" id="inside">
        <div className="m-wrap">
          <div data-rv>
            <p className="m-kicker">{t.kicker}</p>
            <h2 className="m-h2">
              {t.title}
              <br />
              <em>{t.titleEm}</em>
            </h2>
            <p className="m-lede">{t.lede}</p>
          </div>
          <ol className="m-toc" data-rv>
            {Array.map(t.toc, (item, i) => (
              <li key={item.title}>
                <a href={`#ch-${i + 1}`}>
                  <span className="n">{pad(i + 1)}</span>
                  <b>{item.title}</b>
                  <span>{item.sub}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <nav className="m-rail" aria-hidden="true">
        <i className="t" />
        <i className="f" />
        <ol>
          {Array.map(t.toc, (item, i) => (
            <li key={item.title}>{pad(i + 1)}</li>
          ))}
        </ol>
      </nav>

      <StoryBlock label={t.partLabels[0]} chapters={STORIES[0]} t={t} />
      <Marquee t={t.marquee} />
      <StoryBlock label={t.partLabels[1]} chapters={STORIES[1]} t={t} />
    </>
  )
}
