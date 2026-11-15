/**
 * End-to-end test of milestone M1 (MEM-19): the real page, the real API, the
 * real graph and stream. Two modes:
 *
 * - default: scripted models (USINE_SCRIPTED_MODELS=1), deterministic, no
 *   network; this is what the VPS builder runs in scripts/verify.sh;
 * - E2E_REAL=1: the lab's LiteLLM and Langfuse, from the repo's .env (LITELLM_*,
 *   LANGFUSE_*), through `ssh -N -L 4000:127.0.0.1:4000 lab`; run on demand.
 *
 * Both start the API with uvicorn and the front with Vite, which proxies /api.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const REAL = process.env.E2E_REAL === '1'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const API_PORT = Number(process.env.E2E_API_PORT ?? 8010)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5180)

/** The model and tracing settings of .env, for the real mode only. Never logged. */
function realEnv(): Record<string, string> {
  const file = `${ROOT}.env`
  if (!existsSync(file)) throw new Error('E2E_REAL=1 needs the repo .env (LITELLM_*, LANGFUSE_*)')
  const env: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const at = line.indexOf('=')
    const name = line.slice(0, at)
    if (at > 0 && /^(LITELLM_|LANGFUSE_|USINE_MODEL)/.test(name)) env[name] = line.slice(at + 1)
  }
  return env
}

// The e2e drives the atelier itself, not its door (MEM-60): the API runs open.
const apiEnv: Record<string, string> = {
  ...(REAL ? realEnv() : { USINE_SCRIPTED_MODELS: '1' }),
  USINE_ATELIER_OUVERT: '1',
}
// The test reads Langfuse with the same keys as the API.
if (REAL) Object.assign(process.env, apiEnv)

export default defineConfig({
  testDir: 'e2e',
  timeout: REAL ? 180_000 : 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `uv run uvicorn usine_api.app:create_app --factory --host 127.0.0.1 --port ${API_PORT}`,
      cwd: ROOT,
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { USINE_API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
