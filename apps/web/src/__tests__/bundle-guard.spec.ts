// The guard of scripts/check-bundle.mjs catches what it claims to catch.
// verify.sh runs it on the real build (apps/web/dist) right after `pnpm build`.
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain ESM script, no type declarations
import { findLeaks } from '../../scripts/check-bundle.mjs'

describe('bundle guard', () => {
  it.each([
    ['const k="sk-or-v1-0123456789abcdef0123"', 'openai-style key'],
    ['fetch("https://openrouter.ai/api/v1/chat/completions")', 'provider or gateway host'],
    ['base: "http://litellm:4000/v1"', 'provider or gateway host'],
    ['process.env.LITELLM_API_KEY', 'key variable'],
    ['"pk-lf-1234abcd-5678"', 'langfuse key'],
  ])('flags %s', (text, leak) => {
    expect(findLeaks(text)).toContain(leak)
  })

  it('lets the chat endpoint through', () => {
    expect(findLeaks('new DefaultChatTransport({ api: "/api/chat" })')).toEqual([])
  })
})
