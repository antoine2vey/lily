import { errorPage, escapeHtml } from '@lily/mcp/auth/html'
import { HttpServerResponse } from 'effect/http'
import { describe, expect, it } from 'vitest'

describe('escapeHtml', () => {
  it('escapes every occurrence of the five characters HTML reads as markup', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a> & <b title="y">`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt; &amp; &lt;b title=&quot;y&quot;&gt;'
    )
  })
})

describe('errorPage', () => {
  it('escapes its heading and its message and answers 400', async () => {
    const response = errorPage('<b>Stop</b>', '<i>Not & "this"</i>')
    const html = await HttpServerResponse.toWeb(response).text()

    expect(response.status).toBe(400)
    expect(html).toContain('<h2>&lt;b&gt;Stop&lt;/b&gt;</h2>')
    expect(html).toContain(
      '<p>&lt;i&gt;Not &amp; &quot;this&quot;&lt;/i&gt;</p>'
    )
    expect(html).toContain('<p>Please close this window and try again.</p>')
  })

  it('answers with the status it is given, as HTML', () => {
    const web = HttpServerResponse.toWeb(errorPage('Failed', 'Later', 500))

    expect(web.status).toBe(500)
    expect(web.headers.get('content-type')).toContain('text/html')
  })
})
