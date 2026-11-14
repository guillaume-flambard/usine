// The served bundle never carries a provider key or a provider address (MEM-15).
// The browser talks to /api only; keys and gateways live in services/api
// (CLAUDE.md: "La clé du fournisseur ne touche jamais le client").
//
//   node scripts/check-bundle.mjs [dist]     exit 1 and list the hits
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** What must never reach the browser: key shapes, then provider and gateway hosts. */
export const FORBIDDEN = [
  { name: 'openai-style key', pattern: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { name: 'langfuse key', pattern: /\b(pk|sk)-lf-[A-Za-z0-9-]{8,}/ },
  { name: 'google key', pattern: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'groq key', pattern: /\bgsk_[A-Za-z0-9]{20,}/ },
  { name: 'nvidia key', pattern: /\bnvapi-[A-Za-z0-9_-]{20,}/ },
  { name: 'key variable', pattern: /(OPENROUTER|LITELLM|LANGFUSE|GROQ|GEMINI|MISTRAL)_[A-Z_]*KEY/ },
  {
    name: 'provider or gateway host',
    pattern:
      /(openrouter\.ai|api\.openai\.com|api\.groq\.com|generativelanguage\.googleapis|api\.mistral\.ai|integrate\.api\.nvidia|api\.b\.ai|litellm:4000|127\.0\.0\.1:4000)/,
  },
]

export function findLeaks(text) {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name)
}

function files(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

export function scan(dist) {
  return files(dist).flatMap((path) =>
    findLeaks(readFileSync(path, 'utf8')).map((leak) => `${relative(dist, path)}: ${leak}`),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url))
  const hits = scan(dist)
  if (hits.length > 0) {
    console.error(`bundle: provider secrets or addresses in ${dist}:\n  ${hits.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`bundle: ${files(dist).length} files, no provider key or address`)
}
