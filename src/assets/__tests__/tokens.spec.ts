// Deux documents que l'isolation coupe de toute feuille de style.
//
// Le cadre sablé a une origine opaque et une politique qui interdit toute
// ressource externe ; le fichier emporté doit s'ouvrir hors ligne, sans rien.
// Ni l'un ni l'autre ne peut consommer la feuille de l'application, alors
// chacun porte sa copie des couleurs.
//
// L'isolation impose la duplication, elle n'impose pas la divergence. Le
// 2026-09-07 les deux copies et la page hôte disaient trois choses différentes
// de `--muted` et de `--line`, et rien ne le signalait.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

/** Les déclarations `--nom: valeur` d'une source, quelle qu'en soit la forme. */
function tokensOf(source: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, name, value] of source.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;}]/g)) {
    found.set(name, value.toLowerCase())
  }
  return found
}

const frame = tokensOf(read('../../../sandbox.html'))
const takeaway = tokensOf(read('../../app/takeaway.ts'))

describe('les deux copies isolées', () => {
  it('déclarent chacune leurs couleurs', () => {
    expect(frame.size, 'le cadre sablé ne déclare aucune couleur').toBeGreaterThan(0)
    expect(takeaway.size, 'le fichier emporté ne déclare aucune couleur').toBeGreaterThan(0)
  })

  it('disent la même chose des couleurs partagées', () => {
    const shared = [...frame.keys()].filter((name) => takeaway.has(name))
    expect(shared.length, 'les deux copies ne partagent aucun nom').toBeGreaterThan(2)
    for (const name of shared) {
      expect(takeaway.get(name), `--${name} diverge entre les deux copies`).toBe(frame.get(name))
    }
  })

  it('ne gardent aucune couleur de la palette maison abandonnée', () => {
    // Crème, encre chaude, terracotta : ce que la refonte a retiré. Une copie
    // qui les garde n'a pas été mise à jour avec le reste.
    const retired = ['#faf9f7', '#16130f', '#6b6055', '#e7e2da', '#ad4c16', '#e58a4a']
    for (const [where, copy] of [
      ['le cadre sablé', frame],
      ['le fichier emporté', takeaway],
    ] as const) {
      for (const value of copy.values()) {
        expect(retired, `${where} garde une couleur retirée`).not.toContain(value)
      }
    }
  })
})
