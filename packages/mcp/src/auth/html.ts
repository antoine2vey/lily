import { HttpServerResponse } from 'effect/http'

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const errorPage = (heading: string, message: string, status = 400) =>
  HttpServerResponse.text(
    `<html><body style="font-family:sans-serif;padding:2rem;text-align:center">
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(message)}</p>
      <p>Please close this window and try again.</p>
    </body></html>`,
    {
      status,
      contentType: 'text/html',
    }
  )
