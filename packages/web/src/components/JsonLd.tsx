export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: required pattern for JSON-LD schema injection
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
