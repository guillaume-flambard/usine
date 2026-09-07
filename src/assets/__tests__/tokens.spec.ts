// Les jetons existent en trois copies, et c'est l'isolation qui l'impose : la
// page hôte a la sienne, le cadre sablé sert la sienne sous une politique qui
// interdit toute feuille externe, et le fichier emporté hors ligne ne peut
// dépendre de rien. Les trois se ressemblent, elles ne se partagent rien.
//
// L'isolation impose la duplication ; elle n'impose pas la divergence. Le
// 2026-09-07 elles disaient trois choses différentes de `--muted` et de
// `--line`, et rien ne le signalait.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

/** Les déclarations `--nom: valeur` d'une source, quelle qu'en soit la forme. */
function tokensOf(source: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, name, value] of source.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    found.set(name, value.trim().toLowerCase())
  }
  return found
}

const host = tokensOf(read('../tokens.css'))
const frame = tokensOf(read('../../../sandbox.html'))
const takeaway = tokensOf(read('../../app/takeaway.ts'))

describe('les jetons de design', () => {
  it('ont une source qui les porte tous', () => {
    for (const name of ['bg', 'surface', 'ink', 'muted', 'line', 'accent']) {
      expect(host.get(name), `--${name} manque à la source`).toBeDefined()
    }
  })

  for (const [where, copy] of [
    ['le cadre sablé', frame],
    ['le fichier emporté', takeaway],
  ] as const) {
    it(`${where} dit la même chose que la source`, () => {
      expect(copy.size, 'cette copie ne déclare aucun jeton').toBeGreaterThan(0)
      for (const [name, value] of copy) {
        const reference = host.get(name)
        // Une copie peut porter moins de jetons que la source — elle n'habille
        // pas la même chose. Elle ne peut pas en porter un autrement.
        if (reference === undefined) continue
        expect(value, `--${name} diverge de la source`).toBe(reference)
      }
    })
  }
})
