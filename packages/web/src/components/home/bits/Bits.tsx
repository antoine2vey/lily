import { Array } from 'effect'
import { type CSSProperties, type ReactNode, useRef } from 'react'
import { type Locale, plural, useI18n } from '@/i18n'
import type { Messages } from '@/i18n/en'
import { useLive } from '../live'

const loadRooms = () => import('./engines/rooms')
const loadToday = () => import('./engines/today')
const loadCemetery = () => import('./engines/cemetery')

type T = Messages['Bits']
type Kind = 'iphone' | 'ipad' | 'android'

const vars = (v: Record<`--${string}`, string>) => v as CSSProperties

const KIND = {
  watering: { tint: '77,140,217', emoji: '💧' },
  fertilization: { tint: '92,140,92', emoji: '🌿' },
} as const
type KindId = keyof typeof KIND
const kindOf = (type: string): KindId =>
  type === 'fertilization' ? 'fertilization' : 'watering'

// Week strip dots, one row per day, in the order of `devices.days`.
const DOTS: ReadonlyArray<ReadonlyArray<string | undefined>> = [
  [undefined, undefined, 'var(--gold)'],
  ['#5EEAD4', '#5EEAD4'],
  [undefined, undefined],
  [undefined],
  ['var(--gold)'],
  [undefined],
]

function Mi({ id, size }: { id: string; size: number }) {
  return (
    <svg aria-hidden="true" className="i" style={vars({ '--s': `${size}px` })}>
      <use href={`#mi-${id}`} />
    </svg>
  )
}

// home.css scopes the app-screen parts (.status, .hydr, .tabbar...) under
// .wc, whose own rule is the hero grid. display: contents keeps the scope and
// drops the grid.
function AppScope({ children }: { children: ReactNode }) {
  return (
    <div className="wc" style={{ display: 'contents' }}>
      {children}
    </div>
  )
}

function StatusIcons() {
  return (
    <span className="r">
      <svg aria-hidden="true" width="16" height="10" viewBox="0 0 16 10">
        <path d="M8 9.5 1 3a10 10 0 0 1 14 0z" fill="currentColor" />
      </svg>
      <svg aria-hidden="true" width="20" height="10" viewBox="0 0 20 10">
        <rect
          x=".5"
          y=".5"
          width="17"
          height="9"
          rx="2.5"
          fill="none"
          stroke="currentColor"
          opacity=".5"
        />
        <rect x="2" y="2" width="13" height="6" rx="1.5" fill="currentColor" />
      </svg>
    </span>
  )
}

export function Bits() {
  const { m } = useI18n()
  const t = m.Bits
  return (
    <section className="m-bits m-cv" aria-labelledby="m-bits-h">
      <div className="m-wrap">
        <div data-rv>
          <p className="m-kicker">{t.kicker}</p>
          <h2 className="m-h2" id="m-bits-h">
            {t.title}
            <br />
            <em>{t.titleEm}</em>
          </h2>
        </div>
        <div className="m-bits-grid">
          <RoomsCard />
          <HomeCard />
          <CemeteryCard />
          <DevicesCard />
        </div>
      </div>
    </section>
  )
}

function RoomsCard() {
  const ref = useRef<HTMLElement>(null)
  const { m, locale } = useI18n()
  const t = m.Bits
  useLive(ref, loadRooms, t)
  return (
    <article ref={ref} className="m-bit" data-rv>
      <div className="m-bit-art m-app" aria-hidden="true">
        <div className="m-ap m-ap-rooms" data-rooms>
          {Array.map(t.rooms.items, (room) => (
            <div key={room.name} className="m-ap-room">
              <span className="e">{room.emoji}</span>
              <span className="t">
                <b>{room.name}</b>
                <span>
                  <span data-count>
                    {plural(locale, room.count, t.rooms.plants)}
                  </span>
                  <span>{room.light}</span>
                  {room.outdoor && (
                    <span className="out">
                      <Mi id="wb-sunny" size={12} />
                      {t.rooms.outdoor}
                    </span>
                  )}
                </span>
              </span>
              <Mi id="delete-outline" size={20} />
            </div>
          ))}
        </div>
      </div>
      <h3>{t.rooms.title}</h3>
      <p>{t.rooms.body}</p>
    </article>
  )
}

function Task({
  task,
  gone,
  t,
  locale,
}: {
  task: T['home']['queue'][number]
  gone: boolean
  t: T['home']
  locale: Locale
}) {
  const kind = kindOf(task.type)
  return (
    <li className={gone ? 'is-gone' : undefined}>
      <div className="rw">
        <span className="g" style={vars({ '--t': KIND[kind].tint })}>
          <span>{KIND[kind].emoji}</span>
          <svg aria-hidden="true" className="ck" viewBox="0 0 24 24">
            <path d="m5.5 12.5 4.5 4.5 8.5-9" />
          </svg>
        </span>
        <span>
          <b>{task.name}</b>
          {task.late > 0 ? (
            <em>{plural(locale, task.late, t.late)}</em>
          ) : (
            <small>{t.action[kind]}</small>
          )}
        </span>
      </div>
    </li>
  )
}

function HomeCard() {
  const ref = useRef<HTMLElement>(null)
  const { m, locale } = useI18n()
  const t = m.Bits
  const T = t.home
  useLive(ref, loadToday, t)
  const n = T.queue.length
  const progress = vars({ '--p': `${(1 / (1 + n)) * 100}%` })
  const countOf = (type: KindId) =>
    Array.filter(T.queue, (task) => task.type === type).length
  return (
    <article ref={ref} className="m-bit wide" data-rv>
      <div className="m-bit-art m-bit-wall" aria-hidden="true" data-home>
        <div className="m-ap m-ap-widget">
          <div className="l">
            <span className="hd">
              <i className="m-ap-icon" />
              {T.widget}
            </span>
            <div className="st">
              <span className="due">
                <b className="n" data-n>
                  {n}
                </b>
                <span className="cap" data-cap>
                  {plural(locale, n, T.caption)}
                </span>
              </span>
              <span className="done">
                <svg aria-hidden="true" className="ok" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="12" fill="currentColor" />
                  <path
                    d="m6.5 12.5 3.6 3.6 7.4-7.6"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="cap" data-done>
                  {T.allDone}
                </span>
              </span>
            </div>
          </div>
          <ul className="rows" data-rows>
            {Array.map(T.queue, (task, i) => (
              <Task
                key={task.name}
                task={task}
                gone={i >= 3}
                t={T}
                locale={locale}
              />
            ))}
            <li className={n > 3 ? 'more' : 'more is-gone'}>
              <div className="rw">
                <span data-more>{plural(locale, n - 3, T.more)}</span>
              </div>
            </li>
          </ul>
          <span className="m-ap-bar" style={progress} data-bar>
            <i />
          </span>
        </div>
        <div className="m-lk">
          <div className="m-lk-scr">
            <div className="m-lk-isl" />
            <AppScope>
              <div className="status">
                <span />
                <StatusIcons />
              </div>
            </AppScope>
            <p className="m-lk-date" data-lock-date>
              {T.lock.date}
            </p>
            <p className="m-lk-time" data-lock-time>
              {T.lock.time}
            </p>
            <div className="m-ap m-ap-la" data-la>
              <div className="head">
                <i className="m-ap-icon" />
                <span>
                  <b>{T.activity.title}</b>
                  <span data-head>
                    {plural(locale, n, T.activity.headline)}
                  </span>
                </span>
              </div>
              <div className="counts">
                {Array.map(['watering', 'fertilization'] as const, (type) => (
                  <span
                    key={type}
                    className={countOf(type) ? undefined : 'is-gone'}
                    style={vars({ '--t': KIND[type].tint })}
                    data-pill={type}
                  >
                    {KIND[type].emoji}
                    <b>{countOf(type)}</b>
                  </span>
                ))}
              </div>
              <span className="m-ap-bar" style={progress} data-bar>
                <i />
              </span>
            </div>
          </div>
        </div>
      </div>
      <h3>{T.title}</h3>
      <p>{T.body}</p>
    </article>
  )
}

function CemeteryCard() {
  const ref = useRef<HTMLElement>(null)
  const { m } = useI18n()
  const t = m.Bits
  const T = t.cemetery
  useLive(ref, loadCemetery, t)
  return (
    <article ref={ref} className="m-bit wide" data-rv>
      <div className="m-bit-art m-app m-bit-cem">
        <div className="m-ap m-ap-cem" data-cem>
          <div className="m-ap-grave" data-grave>
            <div className="head">
              <span className="ph" aria-hidden="true">
                <Mi id="local-florist" size={28} />
              </span>
              <span className="t">
                <b>{T.plant.name}</b>
                <span className="cat">{T.plant.category}</span>
                <span className="lived">{T.plant.lived}</span>
                <span className="died">{T.plant.died}</span>
              </span>
            </div>
            <div className="foot">
              <button type="button" className="chip" disabled>
                {T.plant.cause}
              </button>
              <span className="act">
                <button type="button" className="bring" data-back>
                  <svg
                    className="i"
                    style={vars({ '--s': '16px' })}
                    aria-hidden="true"
                  >
                    <use href="#mi-restore" />
                  </svg>
                  {T.back}
                </button>
                <span className="del" aria-hidden="true">
                  <Mi id="delete-outline" size={18} />
                </span>
              </span>
            </div>
          </div>
          <div className="m-ap-empty" data-empty hidden>
            <img
              src="/mascot/celebrate.webp"
              width="132"
              height="132"
              loading="lazy"
              decoding="async"
              alt=""
            />
            <b>{T.empty}</b>
          </div>
          <p className="m-ap-toast" role="status" aria-live="polite">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span data-toast />
          </p>
        </div>
      </div>
      <h3>{T.title}</h3>
      <p>{T.body}</p>
      <p className="m-try">{T.try}</p>
    </article>
  )
}

function DevicesCard() {
  const { m } = useI18n()
  const t = m.Bits.devices
  const kinds: ReadonlyArray<readonly [Kind, string]> = [
    ['iphone', 'iphone'],
    ['ipad', 'pad'],
    ['android', 'droid'],
  ]
  return (
    <article className="m-bit" data-rv>
      <div className="m-bit-art m-bit-devs" aria-hidden="true">
        {Array.map(Array.zip(kinds, t.names), ([[kind, cls], name]) => (
          <figure key={kind} className={`dev ${cls}`}>
            <div className="m-dv">
              <AppScope>
                <HomeScreen t={t} kind={kind} />
              </AppScope>
            </div>
            <figcaption>{name}</figcaption>
          </figure>
        ))}
      </div>
      <h3>{t.title}</h3>
      <p>{t.body}</p>
    </article>
  )
}

const ART: ReadonlyArray<ReactNode> = [
  <svg aria-hidden="true" key="snake" className="art" viewBox="0 0 50 50">
    <rect width="50" height="50" fill="#2f4a33" />
    <path
      d="M14 50 18 14l6 36M24 50l4-40 5 40M31 50l6-30 2 30"
      fill="#6f9a52"
      stroke="#c9d98a"
      strokeWidth="1.2"
    />
  </svg>,
  <svg aria-hidden="true" key="pothos" className="art" viewBox="0 0 50 50">
    <rect width="50" height="50" fill="#e9dcc9" />
    <g fill="#7fa65a">
      <path d="M10 22c6-8 14-6 14 2-6 4-12 3-14-2Z" />
      <path d="M26 16c8-6 15-2 13 6-7 2-12 0-13-6Z" />
      <path d="M18 36c4-9 13-9 15-1-6 5-12 5-15 1Z" />
      <path d="M33 34c5-6 12-4 12 3-5 3-10 2-12-3Z" />
    </g>
    <rect x="14" y="40" width="22" height="10" rx="2" fill="#c47a55" />
  </svg>,
  <svg aria-hidden="true" key="fern" className="art" viewBox="0 0 50 50">
    <rect width="50" height="50" fill="#1f2a22" />
    <g stroke="#7c9e5c" strokeWidth="1.4" fill="none">
      <path d="M25 50C22 32 14 22 4 16" />
      <path d="M25 50c2-18 10-28 21-34" />
      <path d="M25 50V8" />
    </g>
    <g stroke="#9bc76d" strokeWidth="1">
      <path d="M25 14l-5-3M25 14l5-3M25 22l-6-3M25 22l6-3M25 30l-6-2M25 30l6-2M13 24l-1-5M13 24l-5 1M37 24l1-5M37 24l5 1" />
    </g>
  </svg>,
]

const TAB_ICONS: ReadonlyArray<ReactNode> = [
  <svg aria-hidden="true" key="home" width="14" height="14" viewBox="0 0 24 24">
    <path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" fill="currentColor" />
  </svg>,
  <svg
    aria-hidden="true"
    key="plants"
    width="14"
    height="14"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="9" r="3" fill="currentColor" />
    <path
      d="M12 3a3 3 0 0 1 3 3 3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3-3ZM5 16c3 0 6 2 7 5 1-3 4-5 7-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  </svg>,
  <svg aria-hidden="true" key="care" width="14" height="14">
    <use href="#i-drop" />
  </svg>,
  <svg
    aria-hidden="true"
    key="profile"
    width="14"
    height="14"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="8" r="4" fill="currentColor" />
    <path d="M4 21c1-5 4-7 8-7s7 2 8 7z" fill="currentColor" />
  </svg>,
]

function HomeScreen({ t, kind }: { t: T['devices']; kind: Kind }) {
  const tabs = Array.zip(t.tabs, TAB_ICONS)
  return (
    <div className={`m-hm m-hm-${kind}`}>
      {kind === 'android' ? (
        <div className="m-hm-as">
          <span>{t.time}</span>
          <i className="cam" />
          <span className="r">
            <svg aria-hidden="true" className="i" viewBox="0 0 24 24">
              <path d="M2 22 22 2v20z" fill="currentColor" />
            </svg>
            <svg aria-hidden="true" className="i">
              <use href="#mi-wifi" />
            </svg>
            <svg aria-hidden="true" className="i">
              <use href="#mi-battery-full" />
            </svg>
          </span>
        </div>
      ) : (
        <>
          {kind === 'iphone' && <div className="island" />}
          <div className="status">
            <span>{kind === 'ipad' ? `${t.time}  ${t.padDate}` : t.time}</span>
            <StatusIcons />
          </div>
        </>
      )}
      <div className="top">
        <div>
          <div className="greet">
            {t.greeting}
            <br />
            {t.user}
          </div>
          <div className="meta">{t.weather}</div>
        </div>
        <div className="pills">
          <div className="row">
            <span className="pill">
              <svg
                aria-hidden="true"
                width="10"
                height="10"
                viewBox="0 0 10 10"
              >
                <path
                  d="M5 1v8M1 5h8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {t.addPlant}
            </span>
            <span className="pill bell">
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0"
                  fill="currentColor"
                />
              </svg>
              <span className="badge">28</span>
            </span>
          </div>
          <span className="pill">
            <svg
              aria-hidden="true"
              width="11"
              height="11"
              style={{ color: 'var(--primary)' }}
            >
              <use href="#i-spark" />
            </svg>
            {t.askLily}
          </span>
        </div>
      </div>
      <div className="today">{t.today}</div>
      <div className="tasks">
        <b>{t.tasks}</b>
        <span>{t.level}</span>
      </div>
      <div className="track">
        <i />
      </div>
      <div className="hydr">
        <h3>{t.hydration}</h3>
        <p>{t.hydrationSub}</p>
        <span className="ic">
          <svg
            aria-hidden="true"
            width="13"
            height="13"
            style={{ color: 'var(--primary)' }}
          >
            <use href="#i-drop" />
          </svg>
        </span>
        <div className="plants">
          {Array.map(Array.zip(t.plants, ART), ([name, art]) => (
            <div key={name} className="pl">
              <div className="m-hm-av">
                {art}
                <span className="drop">
                  <svg
                    aria-hidden="true"
                    width="10"
                    height="10"
                    style={{ color: 'var(--water)' }}
                  >
                    <use href="#i-drop" />
                  </svg>
                </span>
              </div>
              {name}
            </div>
          ))}
        </div>
        <span className="water-all">
          <svg aria-hidden="true" width="15" height="15">
            <use href="#i-check" />
          </svg>
          <span>{t.waterAll}</span>
        </span>
      </div>
      <div className="row-att">
        <span className="w">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24">
            <path d="M12 3 2 20h20Z" fill="var(--coral)" />
            <path
              d="M12 9v5M12 16.5v.5"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div>
          <b>{t.attention}</b>
          <span>{t.attentionCount}</span>
        </div>
      </div>
      <div className="week-h">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24">
          <rect
            x="3"
            y="5"
            width="18"
            height="16"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M3 10h18M8 3v4M16 3v4"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        {t.week}
      </div>
      <div className="week">
        {Array.map(Array.zip(t.days, DOTS), ([day, dots], i) => (
          <div key={day} className={i === 0 ? 'day on' : 'day'}>
            {day}
            <b>{21 + i}</b>
            <span className="dots">
              {Array.map(dots, (bg, k) => (
                <i
                  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative row that never reorders
                  key={k}
                  style={bg ? { background: bg } : undefined}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
      {kind === 'android' ? (
        <>
          <div className="m-hm-nav">
            {Array.map(tabs, ([label, icon], i) => (
              <span key={label} className={i === 0 ? 't on' : 't'}>
                <i>{icon}</i>
                {label}
              </span>
            ))}
          </div>
          <i className="m-hm-gest" />
        </>
      ) : (
        <div className="tabbar">
          {Array.map(tabs, ([label, icon], i) => (
            <div key={label} className={i === 0 ? 'tab on' : 'tab'}>
              {icon}
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
