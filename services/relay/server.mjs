// The relay's entry point. All the logic is in `relay.mjs`; here we only read
// the environment and listen.

import { createRelay } from './relay.mjs'

const PORT = Number(process.env.PORT ?? 3000)
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
}).listen(PORT, () => {
  process.stdout.write(`reasoning relay on :${PORT} — model ${MODEL}\n`)
})
