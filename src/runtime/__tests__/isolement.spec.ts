// L'isolement du noyau est l'invariant central de la story : sans lui, les
// appels au moteur se dispersent. Une règle de lint qu'aucun test ne surveille
// peut être élargie, réordonnée ou contournée sans que rien ne rougisse.
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const linter = new ESLint({ cwd: process.cwd() })

async function messages(chemin: string, source: string) {
  const [resultat] = await linter.lintText(source, { filePath: chemin })
  return (resultat?.messages ?? []).map((m) => m.ruleId ?? '')
}

const REGLES = ['no-restricted-imports', 'no-restricted-syntax']
const bloque = (ids: string[]) => ids.some((id) => REGLES.includes(id))

describe('isolement du moteur de composition', () => {
  it('refuse un import statique de cordis hors du noyau', async () => {
    expect(
      bloque(await messages('src/interdit.ts', "import { Context } from 'cordis'\nvoid Context\n")),
    ).toBe(true)
  })

  it('refuse un import de type, qui compte tout autant', async () => {
    expect(
      bloque(
        await messages(
          'src/interdit.ts',
          "import type { Fiber } from 'cordis'\nexport type F = Fiber\n",
        ),
      ),
    ).toBe(true)
  })

  it('refuse un sous-chemin de cordis', async () => {
    expect(bloque(await messages('src/interdit.ts', "import 'cordis/lib/fiber'\n"))).toBe(true)
  })

  it('refuse un import dynamique, la porte de sortie évidente', async () => {
    expect(
      bloque(await messages('src/interdit.ts', "const m = await import('cordis')\nvoid m\n")),
    ).toBe(true)
  })

  it('refuse cosmokit, la dépendance transitive du moteur', async () => {
    expect(
      bloque(
        await messages(
          'src/interdit.ts',
          "import { defineProperty } from 'cosmokit'\nvoid defineProperty\n",
        ),
      ),
    ).toBe(true)
  })

  it('laisse passer le noyau lui-même', async () => {
    expect(
      bloque(
        await messages('src/runtime/autre.ts', "import { Context } from 'cordis'\nvoid Context\n"),
      ),
    ).toBe(false)
  })

  it('laisse passer le banc de preuve', async () => {
    expect(
      bloque(await messages('spike/sonde.ts', "import { Context } from 'cordis'\nvoid Context\n")),
    ).toBe(false)
  })
})

describe("cantonnement de l'évaluation de code", () => {
  const evalue = (ids: string[]) =>
    ids.some((id) => ['no-eval', 'no-implied-eval', 'no-new-func'].includes(id))

  it('refuse `new Function` hors de la fabrique', async () => {
    expect(
      evalue(await messages('src/agents/rusé.ts', "const f = new Function('return 1')\nvoid f\n")),
    ).toBe(true)
  })

  it('refuse eval hors de la fabrique', async () => {
    expect(evalue(await messages('src/etat/rusé.ts', "eval('1 + 1')\n"))).toBe(true)
  })

  it("laisse la fabrique évaluer : c'est sa raison d'être", async () => {
    expect(
      evalue(await messages('src/agents/libre.ts', "const f = new Function('return 1')\nvoid f\n")),
    ).toBe(false)
  })
})
