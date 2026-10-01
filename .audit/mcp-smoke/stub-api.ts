// Stands in for @lily/api so tools/call runs end to end without the real API.
const port = Number(process.env.STUB_API_PORT ?? 3199)

Bun.serve({
  port,
  hostname: '127.0.0.1',
  fetch(request) {
    const url = new URL(request.url)
    console.log(
      `${request.method} ${url.pathname}${url.search} auth=${request.headers.get('authorization')}`
    )
    if (url.pathname === '/api/plants') return Response.json({ items: [] })
    if (url.pathname === '/api/knowledge/query')
      return Response.json({ answer: 'Water when dry.', sources: [] })
    return new Response('not stubbed', { status: 404 })
  },
})
console.log(`stub api on ${port}`)
