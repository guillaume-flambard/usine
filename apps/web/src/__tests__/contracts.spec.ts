import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RUN_EVENT_KINDS } from '../contracts/ui-stream'

// The run event crosses a language boundary: Python emits it, the web app
// reads it. This test fails as soon as the two lists of kinds drift apart.
const PYTHON_CONTRACT = fileURLToPath(
  new URL('../../../../services/api/usine_api/contracts/run_event.py', import.meta.url),
)

function pythonKinds(): string[] {
  const source = readFileSync(PYTHON_CONTRACT, 'utf8')
  const enumBody = source.slice(
    source.indexOf('class RunEventKind'),
    source.indexOf('class RunEvent('),
  )
  return [...enumBody.matchAll(/=\s*"([a-z-]+)"/g)].map((match) => match[1] as string)
}

describe('run event contract', () => {
  it('has the same kinds in TypeScript and in Python', () => {
    expect([...RUN_EVENT_KINDS].sort()).toEqual(pythonKinds().sort())
  })
})
