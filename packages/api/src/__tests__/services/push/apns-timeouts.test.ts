import { generateKeyPairSync } from 'node:crypto'
import http2 from 'node:http2'
import net from 'node:net'
import {
  type ApnsConfig,
  ApnsSendError,
  makeApnsClient,
} from '@lily/api/services/push/apns-live-activity'
import { Duration, Effect, Exit, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

const config: ApnsConfig = {
  teamId: 'TEAM',
  keyId: 'KEY',
  privateKeyPem: generateKeyPairSync('ec', { namedCurve: 'P-256' })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString(),
  bundleId: 'com.example.app',
  environment: 'sandbox',
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const listen = (server: net.Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, () => resolve((server.address() as net.AddressInfo).port))
  )

// h2c stand-in for APNs. `respond: false` accepts streams and never answers.
const startApns = async (respond: boolean) => {
  const server = http2.createServer()
  const sessions: http2.ServerHttp2Session[] = []
  const closedStreams: http2.ServerHttp2Stream[] = []
  server.on('session', (session) => sessions.push(session))
  server.on('stream', (stream: http2.ServerHttp2Stream) => {
    stream.on('close', () => closedStreams.push(stream))
    if (respond) {
      stream.respond({ ':status': 200, 'apns-id': 'apns-1' })
      stream.end()
    }
  })
  const port = await listen(server)
  cleanups.push(() => {
    for (const session of sessions) session.destroy()
    server.close()
  })
  return { port, sessions, closedStreams }
}

// TCP relay whose existing connections can be silenced, which is what a
// half-open connection looks like: no error, no FIN, just nothing arriving.
const startRelay = async (targetPort: number) => {
  const links: Array<{ dead: boolean }> = []
  const sockets: net.Socket[] = []
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort)
    const link = { dead: false }
    links.push(link)
    sockets.push(client, upstream)
    client.on('data', (d) => {
      if (!link.dead) upstream.write(d)
    })
    upstream.on('data', (d) => {
      if (!link.dead) client.write(d)
    })
    client.on('error', () => upstream.destroy())
    upstream.on('error', () => client.destroy())
  })
  const port = await listen(server)
  cleanups.push(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  return {
    port,
    silenceExisting: () => {
      for (const link of links) link.dead = true
    },
  }
}

const send = (client: ReturnType<typeof makeApnsClient>) =>
  Effect.runPromiseExit(
    client.send({ deviceToken: 'abc', event: 'update', contentState: {} })
  )

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const eventually = async (check: () => boolean) => {
  for (let waited = 0; !check() && waited < 2000; waited += 20) await sleep(20)
}

describe('APNs client against a server that never responds', () => {
  it('fails with ApnsSendError and cancels the stream', async () => {
    const apns = await startApns(false)
    const client = makeApnsClient(config, {
      baseUrl: `http://localhost:${apns.port}`,
      requestTimeout: Duration.millis(300),
    })

    const exit = await send(client)

    expect(
      Exit.findErrorOption(exit).pipe(Option.getOrUndefined)
    ).toBeInstanceOf(ApnsSendError)
    await eventually(() => apns.closedStreams.length > 0)
    expect(apns.closedStreams).toHaveLength(1)
  })

  it('cancels the stream when the send is interrupted', async () => {
    const apns = await startApns(false)
    const client = makeApnsClient(config, {
      baseUrl: `http://localhost:${apns.port}`,
    })

    await Effect.runPromiseExit(
      client
        .send({ deviceToken: 'abc', event: 'update', contentState: {} })
        .pipe(Effect.timeoutOption(Duration.millis(300)))
    )
    await eventually(() => apns.closedStreams.length > 0)

    expect(apns.closedStreams).toHaveLength(1)
    expect(apns.sessions).toHaveLength(1)
  })

  it('opens a fresh connection for the send after a timeout', async () => {
    const apns = await startApns(false)
    const client = makeApnsClient(config, {
      baseUrl: `http://localhost:${apns.port}`,
      requestTimeout: Duration.millis(300),
    })

    await send(client)
    await send(client)

    expect(apns.sessions).toHaveLength(2)
  })

  it('replaces a half-open connection that stops answering pings', async () => {
    const apns = await startApns(true)
    const relay = await startRelay(apns.port)
    const client = makeApnsClient(config, {
      baseUrl: `http://localhost:${relay.port}`,
      requestTimeout: Duration.millis(500),
      pingInterval: Duration.millis(100),
      pingAckTimeout: Duration.millis(100),
    })

    expect(Exit.isSuccess(await send(client))).toBe(true)
    relay.silenceExisting()
    await sleep(1000)

    expect(Exit.isSuccess(await send(client))).toBe(true)
    expect(apns.sessions).toHaveLength(2)
  })
})
