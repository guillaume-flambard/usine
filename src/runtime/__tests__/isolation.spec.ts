// Kernel isolation is the central invariant: without it, calls to the engine
// scatter. A lint rule no test watches can be widened, reordered or bypassed
// without anything turning red.
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const linter = new ESLint({ cwd: process.cwd() })

async function messages(path: string, source: string) {
  const [result] = await linter.lintText(source, { filePath: path })
  return (result?.messages ?? []).map((m) => m.ruleId ?? '')
}

const RULES = ['no-restricted-imports', 'no-restricted-syntax']
const blocked = (ids: string[]) => ids.some((id) => RULES.includes(id))

describe('composition engine isolation', () => {
  it('refuses a static cordis import outside the kernel', async () => {
    expect(
      blocked(await messages('src/forbidden.ts', "import { Context } from 'cordis'\nvoid Context\n")),
    ).toBe(true)
  })

  it('refuses a type import, which counts just as much', async () => {
    expect(
      blocked(
        await messages(
          'src/forbidden.ts',
          "import type { Fiber } from 'cordis'\nexport type F = Fiber\n",
        ),
      ),
    ).toBe(true)
  })

  it('refuses a cordis subpath', async () => {
    expect(blocked(await messages('src/forbidden.ts', "import 'cordis/lib/fiber'\n"))).toBe(true)
  })

  it('refuses a dynamic import, the obvious way out', async () => {
    expect(
      blocked(await messages('src/forbidden.ts', "const m = await import('cordis')\nvoid m\n")),
    ).toBe(true)
  })

  it("refuses cosmokit, the engine's transitive dependency", async () => {
    expect(
      blocked(
        await messages(
          'src/forbidden.ts',
          "import { defineProperty } from 'cosmokit'\nvoid defineProperty\n",
        ),
      ),
    ).toBe(true)
  })

  it('lets the kernel itself through', async () => {
    expect(
      blocked(
        await messages('src/runtime/other.ts', "import { Context } from 'cordis'\nvoid Context\n"),
      ),
    ).toBe(false)
  })

  it('lets the proving ground through', async () => {
    expect(
      blocked(await messages('spike/probe.ts', "import { Context } from 'cordis'\nvoid Context\n")),
    ).toBe(false)
  })
})

describe('confinement of code evaluation', () => {
  const evaluates = (ids: string[]) =>
    ids.some((id) => ['no-eval', 'no-implied-eval', 'no-new-func'].includes(id))

  it('refuses `new Function` outside the free agent', async () => {
    expect(
      evaluates(
        await messages('src/agents/sneaky.ts', "const f = new Function('return 1')\nvoid f\n"),
      ),
    ).toBe(true)
  })

  it('refuses eval outside the free agent', async () => {
    expect(evaluates(await messages('src/state/sneaky.ts', "eval('1 + 1')\n"))).toBe(true)
  })

  it('lets the free agent evaluate: that is the whole point', async () => {
    expect(
      evaluates(
        await messages(
          'src/agents/free-agent.ts',
          "const f = new Function('return 1')\nvoid f\n",
        ),
      ),
    ).toBe(false)
  })
})
