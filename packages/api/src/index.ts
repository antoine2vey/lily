import { HttpRouter } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { LoggerLayer } from '@lily/api/logger'
import { PlantServiceLive } from '@lily/api/services/plants/handler'
import { PlantRpc } from '@lily/api/services/plants/rpc'
import { UserServiceLive } from '@lily/api/services/user/handler'
import { UserRpc } from '@lily/api/services/user/rpc'
import { Layer } from 'effect'

// Combine both RPC groups
const CombinedRpcs = PlantRpc.merge(UserRpc)

// Combine both service layers
const CombinedServices = Layer.merge(PlantServiceLive, UserServiceLive)

const RpcLayer = RpcServer.layer(CombinedRpcs).pipe(
  Layer.provide(CombinedServices)
)

// Choose the protocol and serialization format
const HttpProtocol = RpcServer.layerProtocolHttp({
  path: '/rpc',
}).pipe(Layer.provide(RpcSerialization.layerNdjson))

// Create the main server layer
const Main = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLayer),
  Layer.provide(HttpProtocol),
  Layer.provide(LoggerLayer),
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

BunRuntime.runMain(Layer.launch(Main))
