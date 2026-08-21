// The relay's entry point. All the logic is in `relay.mjs`; here we only read
// the environment and listen.

import { createRelay } from './relay.mjs'

// `RELAY_PORT`, not `PORT`: a PaaS sets `PORT` to the container's public port
// — Coolify sets 80 — and the relay would fight nginx for it. It listens on
// the loopback only; nobody outside the container reaches it.
const PORT = Number(process.env.RELAY_PORT ?? 3000)
const MODEL = process.env.MODEL ?? 'deepseek/deepseek-v4-flash'
const KEY = process.env.OPENROUTER_API_KEY ?? ''

if (KEY.length === 0) {
  // We start anyway: /health will answer `ready: false`, and the site will
  // stay on its replayed demo rather than announcing a model it does not have.
  process.stdout.write('relay with no key: /reason will return 503\n')
}

createRelay({
  key: KEY,
  model: MODEL,
  origin: process.env.ORIGIN ?? 'https://usine.memolabs.dev',
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`reasoning relay on :${PORT} — model ${MODEL}\n`)
})
