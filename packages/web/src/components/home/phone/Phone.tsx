import { Array } from 'effect'
import type { ReactNode } from 'react'
import { useI18n } from '@/i18n'

// Lightness of each side layer, front to back, 1.5px apart in depth.
const LAYERS = Array.map(
  [13, 17, 22, 26, 29, 32, 35, 37, 38, 38, 38, 37, 35, 32, 29, 26, 22, 17, 13],
  (l, k) => ({ l, z: -(k + 1) * 1.5 })
)

const BUTTONS = [
  { side: 'l', top: '120px', height: '22px' },
  { side: 'l', top: '160px', height: '44px' },
  { side: 'l', top: '214px', height: '44px' },
  { side: 'r', top: '180px', height: '70px' },
] as const

export function Floor() {
  return <div className="m-floor" />
}

export function Phone({ children }: { children: ReactNode }) {
  const { status } = useI18n().m.Phone
  return (
    <div className="m-phone">
      <div className="m-shell" aria-hidden="true">
        <i className="m-back" />
        {Array.map(LAYERS, ({ l, z }) => (
          <i
            key={z}
            style={{
              transform: `translateZ(${z}px)`,
              background: `linear-gradient(90deg,hsl(120 4% ${l}%),hsl(120 5% ${l + 16}%) 50%,hsl(120 4% ${l}%))`,
            }}
          />
        ))}
        {Array.map(BUTTONS, (b) => (
          <i
            key={`${b.side}${b.top}`}
            className={`m-btn ${b.side}`}
            style={{ top: b.top, height: b.height }}
          />
        ))}
      </div>
      <div className="m-bezel">
        <div className="m-glass">
          <span className="m-a-island" aria-hidden="true" />
          <div className="m-a-status" aria-hidden="true">
            <span className="m-a-clock">{status.clock}</span>
            <span className="m-a-sig">
              <i />
              <i />
              <i />
              <i />
            </span>
            <svg className="m-a-wifi" viewBox="0 0 17 12" aria-hidden="true">
              <path
                d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.2A10.6 10.6 0 0 0 8.5.6 10.6 10.6 0 0 0 1 3.6l1.2 1.2a9 9 0 0 1 6.3-2.5Zm0 3.4c1.5 0 2.9.6 3.9 1.5l1.2-1.2a7.3 7.3 0 0 0-10.2 0l1.2 1.2c1-1 2.4-1.5 3.9-1.5Zm0 3.4c.6 0 1.2.2 1.6.6L8.5 11.4 6.9 9.7c.4-.4 1-.6 1.6-.6Z"
                fill="currentColor"
              />
            </svg>
            <svg className="m-a-batt" viewBox="0 0 28 13" aria-hidden="true">
              <rect
                x=".5"
                y=".5"
                width="24"
                height="12"
                rx="3.8"
                fill="none"
                stroke="currentColor"
                opacity=".4"
              />
              <rect
                x="2"
                y="2"
                width="21"
                height="9"
                rx="2.4"
                fill="currentColor"
              />
              <path
                d="M26 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z"
                fill="currentColor"
                opacity=".45"
              />
            </svg>
          </div>
          {children}
        </div>
        <i className="m-glare" aria-hidden="true" />
      </div>
    </div>
  )
}
