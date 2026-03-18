export default function RootPage() {
  return (
    <>
      <meta httpEquiv="refresh" content="0;url=/en" />
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: inline locale redirect, no user input
        dangerouslySetInnerHTML={{
          __html: `(function(){var l=navigator.language||'en';location.replace(l.startsWith('fr')?'/fr':'/en')})()`,
        }}
      />
      <noscript>
        <p>
          <a href="/en">English</a> | <a href="/fr">Fran&ccedil;ais</a>
        </p>
      </noscript>
    </>
  )
}
