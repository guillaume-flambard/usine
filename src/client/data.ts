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
