import { HttpRouter } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { LoggerLayer } from '@lily/api/logger'
import { PlantsLive } from '@lily/api/services/plants/handler'
import { PlantRpcs } from '@lily/api/services/plants/requests'
import { UsersLive } from '@lily/api/services/user/handler'
import { UserRpcs } from '@lily/api/services/user/requests'
import { Layer } from 'effect'

// Combine both RPC groups
const CombinedRpcs = UserRpcs.merge(PlantRpcs)

// Combine both service layers
const CombinedServices = Layer.merge(UsersLive, PlantsLive)

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
