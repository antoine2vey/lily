import { useI18n } from '@/i18n'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site'

// B's final section: mascot, headline, lede and the two store badges.
export function CtaBand({ id = 'download' }: { id?: string }) {
  const { m } = useI18n()
  return (
    <section className="m-final m-cv" id={id}>
      <div className="m-wrap" data-rv>
        <img
          className="mascot"
          src="/mascot/jump.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width="220"
          height="220"
        />
        <h2 className="m-h2">
          {m.Cta.title}
          <br />
          <em>{m.Cta.titleEm}</em>
        </h2>
        <p className="m-lede">{m.Cta.lede}</p>
        <div className="m-stores">
          <a className="m-store" href={APP_STORE_URL}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.4 1.4c0 1.1-.5 2.3-1.2 3.1-.7.9-2 1.6-3 1.6h-.3c0-.1-.1-.2-.1-.4 0-1.1.6-2.3 1.2-3 .8-.9 2.1-1.6 3.2-1.7.1.1.2.3.2.4zm4.6 15.7c0 .1-.5 1.6-1.5 3.1-.9 1.3-1.9 2.7-3.4 2.7s-1.9-.9-3.6-.9c-1.7 0-2.3.9-3.7.9s-2.3-1.3-3.4-2.8C4.1 18.3 3 15.5 3 12.9 3 8.6 5.8 6.300 8.6 6.300c1.4 0 2.7 1 3.6 1 .9 0 2.2-1 3.9-1 .6 0 2.9.1 4.4 2.2-.1.1-2.4 1.4-2.4 4.2 0 3.3 2.9 4.4 2.9 4.4z"
              />
            </svg>
            <span>
              <small>{m.Cta.appStoreSmall}</small>
              <b>{m.Cta.appStore}</b>
            </span>
          </a>
          <a className="m-store" href={PLAY_STORE_URL}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3.6 1.9 13.5 12l-9.9 10.1c-.4-.2-.6-.6-.6-1.1V3c0-.5.2-.9.6-1.1z"
                fill="#34A853"
              />
              <path
                d="m16.8 8.7-3.3 3.3-9.9-10.1h.1c.3-.2.8-.2 1.2 0z"
                fill="#4285F4"
              />
              <path
                d="m16.8 15.3-11.9 7c-.4.2-.9.2-1.2 0h-.1l9.9-10.3z"
                fill="#EA4335"
              />
              <path
                d="m20.4 10.6c.9.5.9 1.8 0 2.4l-3.6 2.1-3.3-3.1 3.3-3.3z"
                fill="#FBBC04"
              />
            </svg>
            <span>
              <small>{m.Cta.googlePlaySmall}</small>
              <b>{m.Cta.googlePlay}</b>
            </span>
          </a>
        </div>
      </div>
    </section>
  )
}
