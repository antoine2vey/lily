export default function RootPage() {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: inline locale redirect, no user input
      dangerouslySetInnerHTML={{
        __html: `(function(){var l=navigator.language||'en';location.replace(l.startsWith('fr')?'/fr':'/en')})()`,
      }}
    />
  )
}
