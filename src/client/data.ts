// Upstream reads a `CLIENT_CONFIG` global that the webui server stamps into
// the HTML page it serves, and `connect()` opens the WebSocket back to it.
// This product has no such server: the engine runs in the browser. So the
// config is declared locally with the two fields the shell actually reads,
// and the transport is gone rather than stubbed. Nothing here should grow a
// socket back; if something ever has to cross a process boundary it gets its
// own module and says so.

export interface ClientConfig {
  /** Where the shell mounts its routes. */
  uiPath: string
  /** Whether the page was produced without a live server behind it. */
  static: boolean
  /** Endpoint of the server, absent here by construction. */
  endpoint?: string
  heartbeat?: {
    interval: number
    timeout: number
  }
}

export const global: ClientConfig = {
  uiPath: '/console',
  static: true,
}

// The four type-only imports below used to come from `@cordisjs/plugin-webui`
// and `@cordisjs/plugin-loader`, the server halves of this shell. They are not
// installed here and never will be, so the shapes the shell actually consumes
// are declared locally. Keeping them named and narrow beats an `any`: the
// events are still the contract between the loader, the RPC service and
// whatever opens the loading gate.

/** What the shell can do with a socket. It never has one here. */
export interface AbstractWebSocket {
  send(data: string): void
  close(): void
  addEventListener(type: string, listener: (event: any) => void): void
  removeEventListener(type: string, listener: (event: any) => void): void
}

/** One answer to an RPC call. */
export interface RpcResponse {
  sn: number
  ok: boolean
  value?: unknown
  message?: string
}

/** One entry as the server half described it, as the loader reads it. */
export interface EntryBody {
  files?: string[]
  entryId?: string
  data?: unknown
  /** Opaque here: the shape belongs to `@cordisjs/muon`'s `DeltaState`. */
  cursor?: any
  methods?: string[]
  [key: string]: unknown
}

/** The events the server half used to emit, typed for their local emitters. */
export interface WebuiEvents {
  'entry:init'(value: { version?: string; entries: Record<string, EntryBody> }): void
  'entry:delta'(value: { id: string; [key: string]: unknown }): void
  'rpc:response'(body: RpcResponse): void
}
